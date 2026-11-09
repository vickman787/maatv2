import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

incoming = Path('/root/maat-inference-config.json')
config = json.loads(incoming.read_text())
required = {'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'}
assert set(config) == required and all(config.values()), 'Incomplete inference configuration'
assert config['AI_BASE_URL'] == 'https://api.vultrinference.com/v1'
assert all('\n' not in value and '\r' not in value for value in config.values())
env = Path('/etc/maat/maat.env')
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = env.with_name('maat.env.before-inference-' + stamp)
shutil.copy2(env, backup)
os.chmod(backup, 0o600)
content = env.read_text()
for key, value in config.items():
    line = key + '=' + json.dumps(value)
    pattern = r'^' + re.escape(key) + r'=.*$'
    if re.search(pattern, content, flags=re.MULTILINE):
        content = re.sub(pattern, lambda _: line, content, flags=re.MULTILINE)
    else:
        content += '\n' + line + '\n'
env.write_text(content)
os.chmod(env, 0o600)
incoming.unlink()
print('Inference configuration installed; secret values withheld.')
