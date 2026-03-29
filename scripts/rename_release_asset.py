import sys, os, json, urllib.request

token = os.environ['GITHUB_TOKEN']
code = sys.argv[1]
repo = 'dla6154-dev/work-schedule'

# 릴리즈 정보 가져오기
url = f'https://api.github.com/repos/{repo}/releases/tags/v{code}'
req = urllib.request.Request(url, headers={'Authorization': f'token {token}', 'Accept': 'application/vnd.github+json'})
with urllib.request.urlopen(req) as r:
    release = json.loads(r.read().decode('utf-8'))

asset_id = release['assets'][0]['id']
new_name = f'V{code}근무편성.apk'

# 에셋 이름 변경
payload = json.dumps({'name': new_name}).encode('utf-8')
req = urllib.request.Request(
    f'https://api.github.com/repos/{repo}/releases/assets/{asset_id}',
    data=payload,
    method='PATCH',
    headers={
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
    }
)
with urllib.request.urlopen(req) as r:
    result = json.loads(r.read().decode('utf-8'))

print(f'Renamed: {result["name"]}')
