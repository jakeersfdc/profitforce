"""
Helper: create a simple example model at models/example.joblib
Run with: python ml/api/create_example_model.py
"""
import os

try:
    from sklearn.dummy import DummyClassifier
    import joblib
except Exception:
    print("Missing dependencies: run 'pip install scikit-learn joblib'")
    raise

os.makedirs('models', exist_ok=True)
clf = DummyClassifier(strategy='most_frequent')
clf.fit([[0], [1]], [0, 0])
joblib.dump(clf, os.path.join('models', 'example.joblib'))
print('Wrote models/example.joblib')
