// ==UserScript==
// @name         DanieWatch Bot Link Grabber
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Adds a floating "Copy Bot Command" button to easily copy download links in the WhatsApp bot format.
// @author       Danie
// @match        *://*/*
// @connect      *
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const keywords = [
        'vegamovies', 'rogmovies', 'hdhub4u', 
        'vcloud', 'hubcloud', 'vgmlink', 
        'gdflix', 'nexdrive', 'kmhd', 
        'heymovies', 'katdrive', 'katdrama'
    ];

    const host = window.location.hostname.toLowerCase();
    const isMatched = keywords.some(kw => host.includes(kw));
    if (!isMatched) return;

    console.log('[DanieWatch Link Grabber] Activated on:', host);

    // CSS styling for buttons and notifications
    GM_addStyle(`
        .dw-btn {
            background: linear-gradient(135deg, #10B981, #059669);
            color: white !important;
            border: none;
            padding: 8px 14px;
            font-size: 13px;
            font-weight: bold;
            border-radius: 6px;
            cursor: pointer;
            box-shadow: 0 4px 6px rgba(0,0,0,0.15);
            transition: all 0.2s ease-in-out;
            margin: 4px;
            display: inline-flex;
            align-items: center;
            font-family: system-ui, -apple-system, sans-serif;
            text-decoration: none !important;
        }
        .dw-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 12px rgba(0,0,0,0.2);
            background: linear-gradient(135deg, #34D399, #10B981);
        }
        .dw-btn:active {
            transform: translateY(0);
        }
        .dw-toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #1F2937;
            color: #F9FAFB;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 10px 15px rgba(0,0,0,0.3);
            z-index: 99999;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
            font-weight: 500;
            border-left: 4px solid #10B981;
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .dw-toast.show {
            transform: translateY(0);
            opacity: 1;
        }
    `);

    // Show a toast notification
    function showToast(message) {
        let toast = document.querySelector('.dw-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'dw-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        setTimeout(() => toast.classList.add('show'), 50);
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Helper for cross-origin background fetches
    function gmFetch(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'User-Agent': navigator.userAgent,
                    'Referer': window.location.origin
                },
                onload: (res) => resolve(res.responseText),
                onerror: (err) => reject(err)
            });
        });
    }

    // Copy to clipboard
    function copyCommand(filename, url) {
        const cleanName = filename.replace(/\.mp4$/i, '').trim();
        const command = `.download ${cleanName}.mp4 = ${url}`;
        GM_setClipboard(command);
        showToast(`📋 Copied: "${cleanName}.mp4"`);
    }

    // Clean title from headings
    function getHeadingTitle(element) {
        let prev = element.closest('p, div, center');
        if (prev) {
            let prevSibling = prev.previousElementSibling;
            let checks = 0;
            while (prevSibling && checks < 5) {
                const text = prevSibling.textContent.trim();
                if (text.match(/480p|720p|1080p|2160p|4k/i)) {
                    return text.replace(/^download\s+/i, '').replace(/\s+/g, ' ').trim();
                }
                prevSibling = prevSibling.previousElementSibling;
                checks++;
            }
        }
        return null;
    }

    // Fallback: document.title clean up
    function getCleanTitle() {
        let title = document.title || '';
        title = title.replace(/^download\s+/i, '')
                     .replace(/\s*-\s*vegamovies.*/i, '')
                     .replace(/\s*-\s*rogmovies.*/i, '')
                     .replace(/\s*-\s*hdhub4u.*/i, '')
                     .replace(/\s*page\s+\d+/gi, '')
                     .replace(/\[[^\]]*\]/g, '')
                     .trim();
        return title;
    }

    function detectResolution(headingText, element) {
        const combinedText = ((headingText || '') + ' ' + (element.textContent || '')).toLowerCase();
        if (combinedText.includes('2160p') || combinedText.includes('4k')) return '2160p';
        if (combinedText.includes('1080p')) return '1080p';
        if (combinedText.includes('720p')) return '720p';
        if (combinedText.includes('480p')) return '480p';
        return '720p';
    }

    // Background Link Resolver Pipeline
    async function resolveDirectLink(landingUrl) {
        const landingHtml = await gmFetch(landingUrl);
        const parser = new DOMParser();
        const doc = parser.parseFromString(landingHtml, 'text/html');

        // Find redirect cloud target url
        const matchKeywords = ['vcloud', 'hubcloud', 'gdflix', 'katdrive', 'kmhd', 'vgmlink', 'fastdl', 'filebee'];
        let nextUrl = null;
        
        const anchors = doc.querySelectorAll('a[href]');
        for (const a of anchors) {
            const href = a.href;
            if (href && matchKeywords.some(kw => href.toLowerCase().includes(kw))) {
                if (!href.includes('/category/') && !href.includes('/tag/')) {
                    nextUrl = href;
                    break;
                }
            }
        }

        if (!nextUrl) {
            throw new Error('Redirect link not found on landing page');
        }

        // Case A: Fastdl
        if (nextUrl.includes('fastdl.zip')) {
            const fastdlHtml = await gmFetch(nextUrl);
            const match = /reurl\s*=\s*['"]([^'"]+)['"]/i.exec(fastdlHtml);
            if (match && match[1]) {
                try {
                    const parsed = new URL(match[1]);
                    const link = parsed.searchParams.get('link');
                    if (link) return link;
                } catch (e) {}
                return match[1];
            }
        }

        // Case B: Filebee
        if (nextUrl.includes('filebee.xyz')) {
            const filebeeHtml = await gmFetch(nextUrl);
            const fdoc = parser.parseFromString(filebeeHtml, 'text/html');
            const dlLink = fdoc.querySelector('a[href*="cdn-cgi/content"], a[href*="filepress"]');
            if (dlLink) return dlLink.href;
        }

        // Case C: VCloud / HubCloud / GDFlix
        if (nextUrl.includes('vcloud') || nextUrl.includes('hubcloud') || nextUrl.includes('gdflix') || nextUrl.includes('kmhd')) {
            const vcloudHtml = await gmFetch(nextUrl);
            
            let decodedLink = null;
            const atobMatch = /atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)/.exec(vcloudHtml);
            if (atobMatch && atobMatch[1]) {
                try {
                    const step1 = atob(atobMatch[1]);
                    decodedLink = atob(step1);
                } catch(e){}
            }
            
            if (!decodedLink) {
                const varMatch = /var\s+url\s*=\s*['"]([^'"]+)['"]/i.exec(vcloudHtml);
                if (varMatch && varMatch[1]) {
                    decodedLink = varMatch[1];
                }
            }

            if (!decodedLink && nextUrl.includes('/video/')) {
                const vdoc = parser.parseFromString(vcloudHtml, 'text/html');
                const videoDl = vdoc.querySelector('div.vd > center > a');
                if (videoDl) decodedLink = videoDl.href;
            }

            if (decodedLink) {
                if (!decodedLink.startsWith('http')) {
                    const parsed = new URL(nextUrl);
                    decodedLink = `${parsed.protocol}//${parsed.host}${decodedLink.startsWith('/') ? '' : '/'}${decodedLink}`;
                }

                const dlHtml = await gmFetch(decodedLink);
                const dldoc = parser.parseFromString(dlHtml, 'text/html');

                const finalLinks = [];
                dldoc.querySelectorAll('h2 a.btn, div.card-body a.btn, a.btn, a[href]').forEach(el => {
                    const href = el.href;
                    const text = el.textContent.trim();
                    if (href && (href.startsWith('http') || href.startsWith('/'))) {
                        finalLinks.push({ text, href });
                    }
                });

                let best = finalLinks.find(l => l.text.toLowerCase().includes('fslv2') || l.text.toLowerCase().includes('fsl server'));
                if (!best) best = finalLinks.find(l => l.text.toLowerCase().includes('10gbps') || l.text.toLowerCase().includes('10gbps server'));
                if (!best) best = finalLinks.find(l => l.text.toLowerCase().includes('pixeldrain') || l.text.toLowerCase().includes('pixelserver'));
                if (!best) best = finalLinks.find(l => l.text.toLowerCase().includes('mega server'));
                if (!best) best = finalLinks.find(l => l.text.toLowerCase().includes('download file'));
                if (!best) best = finalLinks[0];

                if (best) {
                    let directUrl = best.href;
                    if (!directUrl.startsWith('http')) {
                        const parsed = new URL(decodedLink);
                        directUrl = `${parsed.protocol}//${parsed.host}${directUrl.startsWith('/') ? '' : '/'}${directUrl}`;
                    }
                    if (directUrl.includes('pixeldrain.com/u/')) {
                        const id = directUrl.split('/u/')[1].split('?')[0];
                        directUrl = `https://pixeldrain.com/api/file/${id}?download`;
                    }
                    return directUrl;
                }
            }
        }

        return nextUrl;
    }

    // Auto-Bypasser for redirect / landing pages (in case users browse them manually)
    function autoBypassShortener() {
        const verifyTexts = [
            'click to verify', 'double click to generate link', 'click here to continue', 
            'verify', 'generate link', 'please wait', 'dual tap to go to link'
        ];

        document.querySelectorAll('a, button, div, span, input').forEach(el => {
            const txt = el.textContent.trim().toLowerCase() || el.value?.toLowerCase() || '';
            if (verifyTexts.some(vt => txt.includes(vt))) {
                if (el.style.display === 'none') el.style.display = 'block';
                if (el.disabled) el.disabled = false;
                el.click();
            }
        });

        const finalLinkTexts = ['get link', 'go to link', 'download now', 'direct download', 'download link'];
        document.querySelectorAll('a, button, input').forEach(el => {
            const txt = el.textContent.trim().toLowerCase() || el.value?.toLowerCase() || '';
            if (finalLinkTexts.some(flt => txt.includes(flt))) {
                if (el.style.display === 'none') el.style.display = 'block';
                if (el.disabled) el.disabled = false;
                el.click();
            }
        });
    }

    if (host.includes('vgmlink') || host.includes('gdflix') || host.includes('nexdrive') || host.includes('heymovies') || host.includes('kmhd')) {
        setInterval(autoBypassShortener, 1000);
    }

    // ----------------------------------------------------
    //  Injections for Main Pages
    // ----------------------------------------------------
    if (host.includes('vegamovies') || host.includes('rogmovies') || host.includes('hdhub4u')) {
        const buttons = [];

        // 1. Grab by class name (vegamovies/rogmovies button template)
        document.querySelectorAll('button.dwd-button, .dwd-button').forEach(btn => {
            const link = btn.closest('a');
            if (link && !buttons.some(b => b.link === link)) {
                buttons.push({ link, target: btn });
            }
        });

        // 2. Grab other anchors matching download patterns
        document.querySelectorAll('a[href]').forEach(link => {
            const href = link.href;
            if (!href || href.startsWith('#')) return;

            const lowerHref = href.toLowerCase();
            if (lowerHref.includes('/category/') || lowerHref.includes('/tag/') || lowerHref.includes('/genre/') || lowerHref.includes('?s=') || lowerHref.includes('/author/')) {
                return;
            }

            if (lowerHref.includes('imdb.com') || lowerHref.includes('youtube.com') || lowerHref.includes('telegram') || lowerHref.includes('facebook') || lowerHref.includes('twitter') || lowerHref.includes('pinterest')) {
                return;
            }

            const text = link.textContent.trim().toLowerCase();
            const isExternal = !href.includes(window.location.hostname);
            const hasDwdKeyword = text.includes('download') || text.includes('click here') || text.includes('v-cloud') || text.includes('g-direct') || text.includes('hubcloud') || text.includes('gdflix');

            if ((isExternal && hasDwdKeyword) || text === 'download now' || link.classList.contains('btn')) {
                if (!buttons.some(b => b.link === link)) {
                    buttons.push({ link, target: link });
                }
            }
        });

        // Inject Bot buttons next to download links
        buttons.forEach(({ link, target }) => {
            const headingTitle = getHeadingTitle(target);
            const res = detectResolution(headingTitle, target);
            const displayTitle = headingTitle || `${getCleanTitle()} [${res}]`;
            
            const btn = document.createElement('button');
            btn.className = 'dw-btn';
            btn.textContent = `📋 Bot [${res}]`;
            btn.style.marginLeft = '10px';
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                showToast('⏳ Resolving direct download link in background...');
                btn.textContent = '⏳ Resolving...';
                btn.disabled = true;
                
                try {
                    const directUrl = await resolveDirectLink(link.href);
                    copyCommand(displayTitle, directUrl);
                } catch (err) {
                    console.error('[DanieWatch] Resolve failed:', err);
                    showToast('⚠️ Direct resolve failed. Copied landing URL.');
                    copyCommand(displayTitle, link.href); // Fallback to landing URL
                } finally {
                    btn.textContent = `📋 Bot [${res}]`;
                    btn.disabled = false;
                }
            });

            link.parentNode.insertBefore(btn, link.nextSibling);
        });
    }

    // ----------------------------------------------------
    //  Injections for Cloud Pages
    // ----------------------------------------------------
    else if (host.includes('vcloud') || host.includes('hubcloud') || host.includes('gdflix') || host.includes('vgmlink')) {
        const btns = document.querySelectorAll('a.btn, h2 a.btn, .btn');
        btns.forEach(btn => {
            const text = btn.textContent.toLowerCase();
            const href = btn.href;
            if (!href) return;

            if (text.includes('download file') || text.includes('pixeldrain') || text.includes('fsl') || text.includes('mega')) {
                const copyBtn = document.createElement('button');
                copyBtn.className = 'dw-btn';
                copyBtn.textContent = '📋 Copy Bot Link';
                copyBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    let directUrl = href;
                    if (directUrl.includes('pixeldrain.com/u/')) {
                        const id = directUrl.split('/u/')[1].split('?')[0];
                        directUrl = `https://pixeldrain.com/api/file/${id}?download`;
                    }
                    const cleanTitle = getCleanTitle();
                    copyCommand(`${cleanTitle}.mp4`, directUrl);
                });
                btn.parentNode.insertBefore(copyBtn, btn.nextSibling);
            }
        });
    }
})();
