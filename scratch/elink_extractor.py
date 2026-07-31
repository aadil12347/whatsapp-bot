import sys
import re
import json
import base64
import io
from urllib.parse import urlparse, parse_qs, unquote
import requests
from bs4 import BeautifulSoup

# Ensure UTF-8 output for Windows console / Kaggle compat
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
}

def decode_double_atob(encoded_str):
    try:
        step1 = base64.b64decode(encoded_str).decode('utf-8')
        step2 = base64.b64decode(step1).decode('utf-8')
        return step2
    except Exception as e:
        return None

def resolve_elink(target_url, referer_url=None):
    session = requests.Session()
    req_headers = HEADERS.copy()
    if referer_url:
        req_headers['Referer'] = referer_url

    print(f"[1] Fetching link page: {target_url}")
    try:
        res = session.get(target_url, headers=req_headers, timeout=15, allow_redirects=True)
        html_content = res.text
    except Exception as e:
        print(f"[ERR] Failed to fetch page: {e}")
        return None

    # Domain mirrors check if blocked / forbidden
    if res.status_code == 403 or "Access Denied" in html_content:
        print("[WARN] Got 403 Forbidden or Access Denied. Attempting domain mirrors...")
        parsed = urlparse(target_url)
        domain = parsed.netloc.lower()
        mirrors = ['vcloud.zip', 'vcloud.lol', 'hubcloud.link', 'hubcloud.club', 'fastdl.zip']
        for mirror in mirrors:
            if mirror in domain:
                continue
            mirror_url = target_url.replace(domain, mirror)
            try:
                print(f"   Trying mirror: {mirror_url}")
                m_res = session.get(mirror_url, headers=req_headers, timeout=10)
                if m_res.status_code == 200 and ('atob(' in m_res.text or 'download' in m_res.text):
                    html_content = m_res.text
                    target_url = mirror_url
                    print(f"[OK] Mirror succeeded!")
                    break
            except Exception:
                pass

    decoded_link = None

    # Pattern 1: Double base64 atob
    atob_matches = re.findall(r'atob\(\s*atob\(\s*[\'"]([^\'"]+)[\'"]\s*\)\s*\)', html_content)
    if atob_matches:
        decoded_link = decode_double_atob(atob_matches[0])
        if decoded_link:
            print(f"[OK] Decoded double-base64 link: {decoded_link}")

    # Pattern 2: var url = '...'
    if not decoded_link:
        var_matches = re.findall(r'var\s+url\s*=\s*[\'"]([^\'"]+)[\'"]', html_content, re.IGNORECASE)
        if var_matches:
            decoded_link = var_matches[0]
            print(f"[OK] Found var url link: {decoded_link}")

    # Pattern 3: FastDL reurl
    if not decoded_link:
        reurl_matches = re.findall(r'reurl\s*=\s*[\'"]([^\'"]+)[\'"]', html_content, re.IGNORECASE)
        if reurl_matches:
            reurl = reurl_matches[0]
            if 'link=' in reurl:
                parsed_reurl = urlparse(reurl)
                qs = parse_qs(parsed_reurl.query)
                if 'link' in qs:
                    decoded_link = qs['link'][0]
                    print(f"[OK] Found reurl direct link: {decoded_link}")

    landing_html = html_content
    landing_url = target_url

    if decoded_link:
        if not decoded_link.startswith('http'):
            parsed_orig = urlparse(target_url)
            landing_url = f"{parsed_orig.scheme}://{parsed_orig.netloc}{'' if decoded_link.startswith('/') else '/'}{decoded_link}"
        else:
            landing_url = decoded_link

        print(f"[2] Fetching landing download options page: {landing_url}")
        try:
            dl_res = session.get(landing_url, headers=req_headers, timeout=15)
            landing_html = dl_res.text
        except Exception as e:
            print(f"[ERR] Failed to fetch download options page: {e}")
            return None

    soup = BeautifulSoup(landing_html, 'html.parser')

    sub_options = []
    for a in soup.find_all('a', href=True):
        href = a['href'].strip()
        text = a.get_text(strip=True)
        if not href or href == '#' or href.startswith('javascript:'):
            continue
        
        # Make absolute URL if relative
        if href.startswith('/'):
            parsed_l = urlparse(landing_url)
            href = f"{parsed_l.scheme}://{parsed_l.netloc}{href}"
            
        lower_text = text.lower()
        lower_href = href.lower()
        
        if any(kw in lower_text or kw in lower_href for kw in ['fsl', 'gdrive', 'drive', 'pixel', '10gbps', 'mega', 'download', 'buzz', 'fastdl', 'filebee', 'stream']):
            if not any(opt['url'] == href for opt in sub_options):
                sub_options.append({'text': text or 'Download Server', 'url': href})

    print(f"\n[3] Found {len(sub_options)} server sub-option(s):")
    results = []

    for idx, opt in enumerate(sub_options, 1):
        srv_name = opt['text']
        srv_url = opt['url']
        final_direct_url = srv_url

        # Check server-specific resolutions
        if '10gbps' in srv_name.lower() or '10 gbps' in srv_name.lower():
            try:
                head_res = session.head(srv_url, headers=req_headers, allow_redirects=True, timeout=10)
                final_url = head_res.url
                if 'link=' in final_url:
                    parsed_link = parse_qs(urlparse(final_url).query)
                    if 'link' in parsed_link:
                        final_direct_url = parsed_link['link'][0]
            except Exception:
                pass

        elif 'buzzserver' in srv_name.lower():
            try:
                buzz_headers = req_headers.copy()
                buzz_headers['Referer'] = srv_url
                buzz_res = session.get(f"{srv_url}/download", headers=buzz_headers, allow_redirects=False, timeout=10)
                hx_redirect = buzz_res.headers.get('hx-redirect')
                if hx_redirect:
                    if hx_redirect.startswith('http'):
                        final_direct_url = hx_redirect
                    else:
                        parsed_b = urlparse(srv_url)
                        final_direct_url = f"{parsed_b.scheme}://{parsed_b.netloc}{hx_redirect}"
            except Exception:
                pass

        elif 'pixeldrain.com/u/' in final_direct_url:
            p_id = final_direct_url.split('/u/')[1].split('?')[0]
            final_direct_url = f"https://pixeldrain.com/api/file/{p_id}?download"

        results.append({
            'index': idx,
            'server': srv_name,
            'initial_url': srv_url,
            'direct_url': final_direct_url
        })
        print(f"   [{idx}] {srv_name}\n       -> {final_direct_url}")

    return results

if __name__ == '__main__':
    test_url = sys.argv[1] if len(sys.argv) > 1 else 'https://vcloud.zip/mrg9sjg5ec1nuze'
    print(f"=== ELINK / VCLOUD EXTRACTOR STARTING ===")
    print(f"Target URL: {test_url}\n")
    resolved = resolve_elink(test_url)
    print("\n=== EXTRACTION COMPLETE ===")
    print(json.dumps(resolved, indent=2))
