#!/usr/bin/env python3
"""Collect public professional Instagram media. Credentials are accepted on stdin only."""
import concurrent.futures
from datetime import datetime, timezone
import json
import statistics
import sys
import urllib.error
import urllib.parse
import urllib.request

if sys.stdin.isatty():
    import termios
    settings = termios.tcgetattr(sys.stdin.fileno())
    settings[3] &= ~termios.ECHO
    termios.tcsetattr(sys.stdin.fileno(), termios.TCSANOW, settings)
    print('ready_for_input', flush=True)
config = json.loads(sys.stdin.readline())
now = datetime.now(timezone.utc)


def age(media):
    try:
        return (now - datetime.fromisoformat(media['timestamp'])).total_seconds() / 86400
    except (ValueError, KeyError):
        return -1


def collect(profile):
    handle = profile['handle']
    if not isinstance(handle, str) or not handle or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._' for c in handle):
        return {'handle': handle, 'ok': False, 'error': 'Invalid public handle'}
    fields = ('business_discovery.username(' + handle + '){username,name,followers_count,'
              'media.limit(20){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,'
              'children.limit(10){id,media_type,media_url,thumbnail_url}}}')
    url = 'https://graph.facebook.com/v26.0/' + urllib.parse.quote(str(config['account_id']), safe='') + '?' + urllib.parse.urlencode({'fields': fields})
    try:
        req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + config['token']})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read()).get('business_discovery', {})
    except urllib.error.HTTPError as error:
        return {'handle': handle, 'ok': False, 'status': error.code}
    except Exception as error:
        return {'handle': handle, 'ok': False, 'error': type(error).__name__}
    media = data.get('media', {}).get('data', [])
    if not data.get('username'):
        return {'handle': handle, 'ok': False, 'error': 'No public professional profile returned'}
    baselines = {}
    for kind in {m.get('media_type') for m in media}:
        values = [m['like_count'] + m['comments_count'] for m in media
                  if m.get('media_type') == kind and 2 <= age(m) <= 60
                  and isinstance(m.get('like_count'), int) and isinstance(m.get('comments_count'), int)]
        baselines[kind] = (statistics.median(values) if len(values) >= 5 else None, len(values))
    posts = []
    for m in media:
        median, count = baselines.get(m.get('media_type'), (None, 0))
        likes, comments = m.get('like_count'), m.get('comments_count')
        total = likes + comments if isinstance(likes, int) and isinstance(comments, int) else None
        images = []
        for child in m.get('children', {}).get('data', []) or [m]:
            image_url = child.get('thumbnail_url') if child.get('media_type') == 'VIDEO' else child.get('media_url')
            if image_url:
                images.append(image_url)
        posts.append({
            'id': m['id'], 'workspace': profile.get('workspace', 'gui-nonato'),
            'origin': profile.get('origin', 'discovery'), 'handle': data['username'],
            'profileName': profile.get('name') or data.get('name') or data['username'],
            'followers': data.get('followers_count'), 'caption': ' '.join(m.get('caption', '').split()[:25]),
            'type': m['media_type'], 'url': m['permalink'], 'publishedAt': m['timestamp'],
            'checkedAt': now.isoformat(), 'likes': likes, 'comments': comments, 'images': images,
            'baselineCount': count, 'baselineMedian': median,
            'relativePerformance': round(total / median, 2) if median and total is not None and 2 <= age(m) <= 60 else None,
            'measurementSource': 'Meta Business Discovery'
        })
    return {'handle': data['username'], 'name': data.get('name'), 'ok': True, 'sampleCount': len(media), 'posts': posts}


with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    results = list(executor.map(collect, config['profiles'][:25]))
print(json.dumps({'collectedAt': now.isoformat(), 'results': results}, ensure_ascii=False), flush=True)
