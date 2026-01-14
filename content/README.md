## Content storage (static, deployable, offline-friendly)

- **Chapters**: `/content/{subject}/{chapterId}.json`
- **PYQs**: `/content/pyq/{subject}/{chapterId}.json`

Subjects (strict):
- `math`
- `physics`
- `chemistry`

### Chapter JSON schema (v1)

```json
{
  "schemaVersion": 1,
  "subject": "math",
  "chapterId": "vectors",
  "chapterName": "Vectors",
  "weightage": "high",
  "difficulty": "medium",
  "subtopics": [
    {
      "id": "dot-product",
      "name": "Dot product & projections",
      "difficulty": "medium",
      "weightage": "high",
      "tags": ["must-know", "pyq-heavy"]
    }
  ],
  "formulas": [
    {
      "id": "dot",
      "expression": "a·b = |a||b|cosθ",
      "tags": ["must-memorize", "frequently-asked"]
    }
  ],
  "shortcuts": ["..."],
  "traps": ["..."],
  "pyqReference": [{"year": 2020, "note": "Angle between vectors / dot product sign"}]
}
```

### PYQ JSON schema (v1)

```json
{
  "schemaVersion": 1,
  "subject": "math",
  "chapterId": "vectors",
  "items": [
    {
      "id": "m-vectors-2020-01",
      "year": 2020,
      "difficulty": "medium",
      "question": "If a·b = 0 and |a| = 3, |b| = 4, then angle between a and b is:",
      "options": ["0°", "90°", "180°", "60°"],
      "correctIndex": 1,
      "shortSolution": "Use a·b = |a||b|cosθ. If a·b=0 => cosθ=0 => θ=90°.",
      "whyOthersWrong": [
        "0° would mean parallel => dot product positive maximum, not zero.",
        "180° means anti-parallel => dot product negative minimum, not zero.",
        "60° gives cos60=1/2 => dot product non-zero."
      ]
    }
  ]
}
```

