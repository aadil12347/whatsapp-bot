import sys
import re
import json
import base64
import io
import concurrent.futures
from urllib.parse import urlparse, parse_qs
import requests
from bs4 import BeautifulSoup

# Ensure safe output formatting
if hasattr(sys.stdout, 'buffer'):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    except Exception:
        pass

# Try curl_cffi or standard requests
try:
    from curl_cffi import requests as real_browser
    USE_CURL_CFFI = True
except ImportError:
    import requests as real_browser
    USE_CURL_CFFI = False

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

def get_fresh_public_proxies():
    print("🔄 Fetching fresh live proxy lists...")
    proxy_urls = [
        "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=4000&country=all&ssl=all&anonymity=all",
        "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
        "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt"
    ]
    proxies = []
    for p_url in proxy_urls:
        try:
            r = requests.get(p_url, timeout=5)
            if r.status_code == 200:
                lines = r.text.strip().split('\n')
                for line in lines:
                    line = line.strip()
                    if re.match(r'^\d+\.\d+\.\d+\.\d+:\d+$', line):
                        proxies.append(f"http://{line}")
        except Exception:
            pass
    print(f"✅ Found {len(proxies)} public proxy candidates.")
    return proxies

def try_fetch_url(url, proxy=None):
    req_headers = HEADERS.copy()
    proxy_dict = {"http": proxy, "https": proxy} if proxy else None
    try:
        if USE_CURL_CFFI:
            res = real_browser.get(url, headers=req_headers, proxies=proxy_dict, impersonate="chrome120", timeout=8)
        else:
            res = real_browser.get(url, headers=req_headers, proxies=proxy_dict, timeout=8)

        if res.status_code == 200 and len(res.text) > 300:
            html = res.text
            if 'shopify' not in html.lower() and ('atob(' in html or 'download' in html.lower() or 'token=' in html):
                return True, html, proxy
    except Exception:
        pass
    return False, None, proxy

def fetch_vcloud_automatically(url):
    print(f"[1] Attempting automatic extraction for: {url}")

    # 1. Direct fetch attempt
    ok, html, _ = try_fetch_url(url)
    if ok:
        print("✅ Direct request succeeded!")
        return html, url

    # 2. Web proxy fallback services
    web_proxies = [
        f"https://api.codetabs.com/v1/proxy?quest={requests.utils.quote(url)}",
        f"https://corsproxy.io/?{requests.utils.quote(url)}"
    ]
    for wp in web_proxies:
        try:
            ok, html, _ = try_fetch_url(wp)
            if ok:
                print("✅ Web proxy request succeeded!")
                return html, url
        except Exception:
            pass

    # 3. Automatic fresh proxy rotator
    fresh_proxies = get_fresh_public_proxies()
    print("🚀 Testing fresh proxies in parallel (50 workers)...")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        futures = [executor.submit(try_fetch_url, url, px) for px in fresh_proxies[:300]]
        for future in concurrent.futures.as_completed(futures):
            ok, html, working_proxy = future.result()
            if ok:
                print(f"🎉 SUCCESS! Working Proxy Found: {working_proxy}")
                return html, url

    return None, None

def decode_double_atob(encoded_str):
    try:
        step1 = base64.b64decode(encoded_str).decode('utf-8')
        step2 = base64.b64decode(step1).decode('utf-8')
        return step2
    except Exception:
        return None

def resolve_elink_auto(target_url):
    html_content, current_url = fetch_vcloud_automatically(target_url)

    if not html_content:
        print("❌ All proxy attempts failed. Cloudflare is blocking Kaggle IP.")
        return []

    decoded_link = None
    atob_matches = re.findall(r'atob\(\s*atob\(\s*[\'"]([^\'"]+)[\'"]\s*\)\s*\)', html_content)
    if atob_matches:
        decoded_link = decode_double_atob(atob_matches[0])

    if not decoded_link:
        var_matches = re.findall(r'var\s+url\s*=\s*[\'"]([^\'"]+)[\'"]', html_content, re.IGNORECASE)
        for vm in var_matches:
            if 'shopify' not in vm:
                decoded_link = vm
                break

    landing_html = html_content
    landing_url = current_url

    if decoded_link:
        if not decoded_link.startswith('http'):
            parsed_orig = urlparse(target_url)
            landing_url = f"{parsed_orig.scheme}://{parsed_orig.netloc}{'' if decoded_link.startswith('/') else '/'}{decoded_link}"
        else:
            landing_url = decoded_link

        print(f"[2] Fetching landing options page: {landing_url}")
        l_html, _ = fetch_vcloud_automatically(landing_url)
        if l_html:
            landing_html = l_html

    soup = BeautifulSoup(landing_html, 'html.parser')
    sub_options = []

    for a in soup.find_all('a', href=True):
        href = a['href'].strip()
        text = a.get_text(strip=True)
        if not href or href == '#' or href.startswith('javascript:'):
            continue

        if href.startswith('/'):
            parsed_l = urlparse(landing_url)
            href = f"{parsed_l.scheme}://{parsed_l.netloc}{href}"

        lower_text = text.lower()
        lower_href = href.lower()
        keywords = ['fsl', 'gdrive', 'drive', 'pixel', '10gbps', 'mega', 'download', 'buzz', 'fastdl', 'filebee', 'stream']
        if any(kw in lower_text or kw in lower_href for kw in keywords):
            if not any(opt['url'] == href for opt in sub_options):
                sub_options.append({'text': text or 'Download Server', 'url': href})

    print(f"\n[3] Extracted {len(sub_options)} direct server sub-option(s):")
    results = []

    for idx, opt in enumerate(sub_options, 1):
        srv_name = opt['text']
        srv_url = opt['url']
        final_direct_url = srv_url

        if 'pixeldrain.com/u/' in final_direct_url:
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
    test_link = sys.argv[1] if len(sys.argv) > 1 else "https://vcloud.zip/mrg9sjg5ec1nuze"
    extracted = resolve_elink_auto(test_link)

    print("\n=== EXTRACTED DIRECT LINKS (JSON) ===")
    print(json.dumps(extracted, indent=2))
