import os
import tempfile

os.environ.setdefault("VF_DATA_DIR", tempfile.mkdtemp(prefix="vf-test-"))
