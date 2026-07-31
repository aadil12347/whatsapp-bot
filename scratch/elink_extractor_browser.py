import sys
import re
import json
import base64
import io
from urllib.parse import urlparse, parse_qs
from bs4 import BeautifulSoup

# Ensure UTF-8 output formatting for standard console, safe for Jupyter Notebooks / Kaggle
if hasattr(sys.stdout, 'buffer'):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    except Exception:
        pass

# Try real browser TLS impersonation library (curl_cffi), or cloudscraper fallback
try:
    from curl_cffi import requests as real_browser
    MODE = "curl_cffi (Chrome TLS Impersonation)"
except ImportError:
    try:
        import cloudscraper
        real_browser = cloudscraper.create_scraper(
            browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True}
        )
        MODE = "cloudscraper"
    except ImportError:
        import requests as real_browser
        MODE = "standard requests"

print(f"🌐 Active Engine: {MODE}")

# Chrome 133 Browser Headers
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

def fetch_page_as_browser(url, referer=None):
    req_headers = HEADERS.copy()
    if referer:
        req_headers['Referer'] = referer

    if MODE.startswith("curl_cffi"):
        # Impersonate Chrome 120 TLS fingerprint and headers
        res = real_browser.get(url, headers=req_headers, impersonate="chrome120", timeout=15)
        return res.status_code, res.text
    elif MODE == "cloudscraper":
        res = real_browser.get(url, headers=req_headers, timeout=15)
        return res.status_code, res.text
    else:
        res = real_browser.get(url, headers=req_headers, timeout=15)
        return res.status_code, res.text

def decode_double_atob(encoded_str):
    try:
        step1 = base64.b64decode(encoded_str).decode('utf-8')
        step2 = base64.b64decode(step1).decode('utf-8')
        return step2
    except Exception:
        return None

def is_valid_vcloud_html(html):
    if not html or len(html) < 200:
        return False
    # Filter out parked / shopify dummy pages
    if 'shopify' in html.lower() or 'myshopify' in html.lower() or 'domain for sale' in html.lower():
        return False
    return ('atob(' in html or 'token=' in html or 'download' in html.lower())

def resolve_elink(target_url, referer_url=None):
    print(f"[1] Sending request as Real Browser to: {target_url}")
    
    status, html_content = fetch_page_as_browser(target_url, referer_url)
    
    # Mirror fallback if Cloudflare blocks or parked domain
    if status == 403 or not is_valid_vcloud_html(html_content):
        print(f"[WARN] Status {status} or parked domain detected. Trying real mirrors...")
        parsed = urlparse(target_url)
        domain = parsed.netloc.lower()
        mirrors = ['vcloud.zip', 'hubcloud.link', 'hubcloud.club', 'fastdl.zip', 'vcloud.lol']
        
        for mirror in mirrors:
            if mirror in domain:
                continue
            mirror_url = target_url.replace(domain, mirror)
            try:
                print(f"   Trying mirror: {mirror_url}")
                m_status, m_html = fetch_page_as_browser(mirror_url, referer_url)
                if m_status == 200 and is_valid_vcloud_html(m_html):
                    html_content = m_html
                    target_url = mirror_url
                    print(f"[OK] Succeeded using valid mirror: {mirror_url}")
                    break
            except Exception as e:
                print(f"   Mirror failed: {e}")

    if not is_valid_vcloud_html(html_content):
        print("[ERR] Could not retrieve valid VCloud page content.")
        return []

    decoded_link = None

    # Pattern 1: Double base64 atob encoding
    atob_matches = re.findall(r'atob\(\s*atob\(\s*[\'"]([^\'"]+)[\'"]\s*\)\s*\)', html_content)
    if atob_matches:
        decoded_link = decode_double_atob(atob_matches[0])
        if decoded_link and 'shopify' not in decoded_link:
            print(f"[OK] Decoded double-base64 token link: {decoded_link}")
        else:
            decoded_link = None

    # Pattern 2: var url = '...' (excluding shopify dummy links)
    if not decoded_link:
        var_matches = re.findall(r'var\s+url\s*=\s*[\'"]([^\'"]+)[\'"]', html_content, re.IGNORECASE)
        for vm in var_matches:
            if 'shopify' not in vm and 'myshopify' not in vm:
                decoded_link = vm
                print(f"[OK] Found valid var url: {decoded_link}")
                break

    landing_html = html_content
    landing_url = target_url

    if decoded_link:
        if not decoded_link.startswith('http'):
            parsed_orig = urlparse(target_url)
            landing_url = f"{parsed_orig.scheme}://{parsed_orig.netloc}{'' if decoded_link.startswith('/') else '/'}{decoded_link}"
        else:
            landing_url = decoded_link

        print(f"[2] Fetching landing options page as Real Browser: {landing_url}")
        _, landing_html = fetch_page_as_browser(landing_url, target_url)

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

    print(f"\n[3] Found {len(sub_options)} server sub-option(s):")
    results = []

    for idx, opt in enumerate(sub_options, 1):
        srv_name = opt['text']
        srv_url = opt['url']
        final_direct_url = srv_url

        # Pixeldrain direct download link conversion
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

# Test URL:
test_link = sys.argv[1] if len(sys.argv) > 1 else "https://vcloud.zip/mrg9sjg5ec1nuze"
extracted = resolve_elink(test_link)

print("\n=== EXTRACTED DIRECT LINKS (JSON) ===")
print(json.dumps(extracted, indent=2))
