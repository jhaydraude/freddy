"""
Generate OpenAPI specification from FastAPI app
"""
import json
import sys
from pathlib import Path

# Add app to path
sys.path.insert(0, str(Path(__file__).parent))

from app.main import app

# Generate OpenAPI spec
openapi_spec = app.openapi()

# Write to file
output_file = Path(__file__).parent / "openapi.json"
with open(output_file, 'w') as f:
    json.dump(openapi_spec, f, indent=2)

print(f"OpenAPI spec written to {output_file}")
print(f"Endpoints: {len(openapi_spec.get('paths', {}))}")
