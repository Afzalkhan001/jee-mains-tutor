/**
 * IndexedDB-based storage for chat history and shared memory.
 * Provides persistent storage that survives browser restarts.
 */

const DB_NAME = "jee_tutor_db";
const DB_VERSION = 1;
const CHAT_STORE = "chat_sessions";
const MEMORY_STORE = "shared_memory";

type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    text: string;
    imageDataUrl?: string;
    createdAt: number;
    meta?: { cached?: boolean };
};

type ChatSession = {
    id: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
    topic?: string;
};

type MemoryEntry = {
    key: string;
    value: unknown;
    savedAt: number;
    expiresAt?: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("IndexedDB not available"));
    }

    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Chat sessions store
            if (!db.objectStoreNames.contains(CHAT_STORE)) {
                const chatStore = db.createObjectStore(CHAT_STORE, { keyPath: "id" });
                chatStore.createIndex("updatedAt", "updatedAt", { unique: false });
                chatStore.createIndex("topic", "topic", { unique: false });
            }

            // Shared memory store (for caching, preferences, etc.)
            if (!db.objectStoreNames.contains(MEMORY_STORE)) {
                const memoryStore = db.createObjectStore(MEMORY_STORE, { keyPath: "key" });
                memoryStore.createIndex("expiresAt", "expiresAt", { unique: false });
            }
        };
    });

    return dbPromise;
}

// --- Chat Session Operations ---

export async function saveCurrentSession(
    sessionId: string,
    messages: ChatMessage[],
    topic?: string
): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(CHAT_STORE, "readwrite");
        const store = tx.objectStore(CHAT_STORE);

        const existing = await new Promise<ChatSession | undefined>((resolve) => {
            const request = store.get(sessionId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(undefined);
        });

        const session: ChatSession = {
            id: sessionId,
            messages,
            createdAt: existing?.createdAt || Date.now(),
            updatedAt: Date.now(),
            topic: topic || existing?.topic || inferTopic(messages),
        };

        store.put(session);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn("Failed to save session to IndexedDB:", err);
    }
}

export async function loadSession(sessionId: string): Promise<ChatMessage[] | null> {
    try {
        const db = await openDB();
        const tx = db.transaction(CHAT_STORE, "readonly");
        const store = tx.objectStore(CHAT_STORE);

        return new Promise((resolve) => {
            const request = store.get(sessionId);
            request.onsuccess = () => {
                const session = request.result as ChatSession | undefined;
                resolve(session?.messages || null);
            };
            request.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

export async function getAllSessions(): Promise<ChatSession[]> {
    try {
        const db = await openDB();
        const tx = db.transaction(CHAT_STORE, "readonly");
        const store = tx.objectStore(CHAT_STORE);
        const index = store.index("updatedAt");

        return new Promise((resolve) => {
            const request = index.openCursor(null, "prev"); // Most recent first
            const sessions: ChatSession[] = [];

            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    sessions.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(sessions);
                }
            };
            request.onerror = () => resolve([]);
        });
    } catch {
        return [];
    }
}

export async function deleteSession(sessionId: string): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(CHAT_STORE, "readwrite");
        const store = tx.objectStore(CHAT_STORE);
        store.delete(sessionId);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn("Failed to delete session:", err);
    }
}

// --- Shared Memory Operations ---

export async function setMemory<T>(
    key: string,
    value: T,
    opts?: { ttlMs?: number }
): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(MEMORY_STORE, "readwrite");
        const store = tx.objectStore(MEMORY_STORE);

        const entry: MemoryEntry = {
            key,
            value,
            savedAt: Date.now(),
            expiresAt: opts?.ttlMs ? Date.now() + opts.ttlMs : undefined,
        };

        store.put(entry);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn("Failed to save to memory:", err);
    }
}

export async function getMemory<T>(key: string): Promise<T | null> {
    try {
        const db = await openDB();
        const tx = db.transaction(MEMORY_STORE, "readonly");
        const store = tx.objectStore(MEMORY_STORE);

        return new Promise((resolve) => {
            const request = store.get(key);
            request.onsuccess = () => {
                const entry = request.result as MemoryEntry | undefined;
                if (!entry) {
                    resolve(null);
                    return;
                }
                if (entry.expiresAt && entry.expiresAt <= Date.now()) {
                    // Expired - clean up async
                    deleteMemory(key).catch(() => { });
                    resolve(null);
                    return;
                }
                resolve(entry.value as T);
            };
            request.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

export async function deleteMemory(key: string): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(MEMORY_STORE, "readwrite");
        const store = tx.objectStore(MEMORY_STORE);
        store.delete(key);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn("Failed to delete from memory:", err);
    }
}

// --- Utility ---

function inferTopic(messages: ChatMessage[]): string | undefined {
    const firstUserMsg = messages.find((m) => m.role === "user" && m.text);
    if (!firstUserMsg) return undefined;

    const text = firstUserMsg.text.toLowerCase();

    // Simple topic detection based on keywords
    const topics: Record<string, string[]> = {
        kinematics: ["kinematics", "motion", "velocity", "acceleration", "displacement"],
        mechanics: ["force", "newton", "momentum", "friction", "gravitation"],
        thermodynamics: ["heat", "temperature", "entropy", "thermodynamic"],
        electrostatics: ["charge", "electric field", "coulomb", "capacitor"],
        magnetism: ["magnetic", "magnet", "induction", "faraday"],
        optics: ["light", "lens", "mirror", "refraction", "diffraction"],
        chemistry: ["reaction", "bond", "organic", "inorganic", "periodic"],
        mathematics: ["calculus", "integral", "derivative", "matrix", "vector"],
    };

    for (const [topic, keywords] of Object.entries(topics)) {
        if (keywords.some((kw) => text.includes(kw))) {
            return topic;
        }
    }

    return "general";
}

// Clean up expired entries periodically
export async function cleanupExpired(): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(MEMORY_STORE, "readwrite");
        const store = tx.objectStore(MEMORY_STORE);
        const index = store.index("expiresAt");
        const now = Date.now();

        const request = index.openCursor(IDBKeyRange.upperBound(now));
        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
    } catch (err) {
        console.warn("Failed to cleanup expired entries:", err);
    }
}
