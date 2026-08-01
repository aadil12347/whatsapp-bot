import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/download_link.dart';
import '../services/scraper_service.dart';
import '../services/resolver_service.dart';
import '../theme/app_theme.dart';

/// Modal bottom sheet displaying detail page download links.
/// Resolves VCloud landing links to direct download links (single movie or series episode list).
/// Displays a floating WhatsApp green notification prompt when user copies command.
class ResolutionModal extends StatefulWidget {
  final String postUrl;
  final String movieTitle;
  final Color accentColor;

  const ResolutionModal({
    super.key,
    required this.postUrl,
    required this.movieTitle,
    this.accentColor = AppTheme.accent,
  });

  @override
  State<ResolutionModal> createState() => _ResolutionModalState();
}

class _ResolutionModalState extends State<ResolutionModal> {
  bool _loadingLinks = true;
  List<DownloadLink> _links = [];
  String? _error;

  // Resolving state
  bool _resolving = false;
  int _resolvingCurrent = 0;
  int _resolvingTotal = 0;
  List<String> _resolvedUrls = [];
  String? _resolvedServerName;
  String? _selectedText;

  // Copy indicator state
  bool _isCopied = false;

  @override
  void initState() {
    super.initState();
    _loadPostLinks();
  }

  Future<void> _loadPostLinks() async {
    try {
      final links = await ScraperService.scrapePostLinks(widget.postUrl);

      // Deduplicate links by href
      final seenHref = <String>{};
      final uniqueLinks = <DownloadLink>[];
      for (final l in links) {
        if (!seenHref.contains(l.href)) {
          seenHref.add(l.href);
          uniqueLinks.add(l);
        }
      }

      if (!mounted) return;
      setState(() {
        _links = uniqueLinks;
        _loadingLinks = false;
        if (_links.isEmpty) {
          _error = 'No download links could be parsed from this page.';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingLinks = false;
        _error = 'Failed to load post page: $e';
      });
    }
  }

  Future<void> _resolveLink(DownloadLink link) async {
    setState(() {
      _resolving = true;
      _resolvingCurrent = 0;
      _resolvingTotal = 0;
      _resolvedUrls = [];
      _resolvedServerName = null;
      _selectedText = link.text;
      _isCopied = false;
    });

    try {
      final result = await ResolverService.resolveAllEpisodes(
        link.href,
        onProgress: (current, total, isDone) {
          if (!mounted) return;
          setState(() {
            _resolvingCurrent = current;
            _resolvingTotal = total;
          });
        },
      );
      if (!mounted) return;
      setState(() {
        _resolving = false;
        _resolvedUrls = result.directUrls;
        _resolvedServerName = result.serverName;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _resolving = false;
        _resolvedUrls = [link.href];
        _resolvedServerName = 'Direct Link';
      });
    }
  }

  /// Generate the WhatsApp .d command message: .d link1, link2, ...
  String _generateWhatsAppMessage() {
    if (_resolvedUrls.isNotEmpty) {
      return '.d ${_resolvedUrls.join(', ')}';
    }
    return '';
  }

  /// Format command for display in preview box (wrapped, readable)
  String _generateDisplayMessage() {
    if (_resolvedUrls.isNotEmpty) {
      if (_resolvedUrls.length == 1) {
        return '.d ${_resolvedUrls.first}';
      }
      // Multi-episode: show each link on a new line for readability
      final buffer = StringBuffer('.d ');
      for (int i = 0; i < _resolvedUrls.length; i++) {
        buffer.write(_resolvedUrls[i]);
        if (i < _resolvedUrls.length - 1) {
          buffer.write(',\n');
        }
      }
      return buffer.toString();
    }
    return '';
  }

  void _copyToClipboard(String text) {
    Clipboard.setData(ClipboardData(text: text));

    setState(() {
      _isCopied = true;
    });

    // Reset button copied state after 3 seconds
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) {
        setState(() {
          _isCopied = false;
        });
      }
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: const [
            Icon(Icons.check_circle_rounded, color: Colors.white, size: 20),
            SizedBox(width: 10),
            Text(
              'WhatsApp Command Copied to Clipboard!',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF25D366), // WhatsApp Green!
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        duration: const Duration(seconds: 3),
      ),
    );
  }

  void _shareToWhatsApp() {
    final msg = _generateWhatsAppMessage();
    if (msg.isNotEmpty) {
      const MethodChannel('com.daniewatch/share')
          .invokeMethod('shareText', {'text': msg});
    }
  }

  /// Extract size snippet like 1.2GB or 470MB from link text
  String? _extractFileSize(String text) {
    final match = RegExp(
      r'\[\s*(\d+(?:\.\d+)?\s*(?:MB|GB|mb|gb))\s*\]|\(\s*(\d+(?:\.\d+)?\s*(?:MB|GB|mb|gb))\s*\)|\b(\d+(?:\.\d+)?\s*(?:MB|GB))\b',
      caseSensitive: false,
    ).firstMatch(text);

    if (match != null) {
      final raw = match.group(1) ?? match.group(2) ?? match.group(3) ?? match.group(0)!;
      return raw.replaceAll('[', '').replaceAll(']', '').replaceAll('(', '').replaceAll(')', '').trim();
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (ctx, scrollController) => Container(
        decoration: const BoxDecoration(
          color: AppTheme.bgModal,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          children: [
            // Handle bar
            Padding(
              padding: const EdgeInsets.only(top: 12, bottom: 8),
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppTheme.textMuted,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            // Movie Title Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                widget.movieTitle,
                style: const TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 8),
            const Divider(color: AppTheme.divider, height: 1),
            // Body Content
            Expanded(
              child: _buildContent(scrollController),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(ScrollController scrollController) {
    if (_loadingLinks) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: AppTheme.accent),
            SizedBox(height: 16),
            Text('Parsing download options...',
                style: TextStyle(color: AppTheme.textSecondary)),
          ],
        ),
      );
    }

    if (_error != null && _links.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_error!,
              style: const TextStyle(color: AppTheme.error),
              textAlign: TextAlign.center),
        ),
      );
    }

    // Show resolved direct link result
    if (_resolvedUrls.isNotEmpty) {
      return _buildResolvedResult(scrollController);
    }

    // Show resolving progress
    if (_resolving) {
      return _buildResolvingState();
    }

    // Show extracted download link buttons
    return _buildLinkButtons(scrollController);
  }

  Widget _buildLinkButtons(ScrollController scrollController) {
    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
      itemCount: _links.length + 1,
      itemBuilder: (ctx, idx) {
        if (idx == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12, left: 4),
            child: Row(
              children: [
                const Icon(Icons.download_for_offline_rounded,
                    color: AppTheme.accent, size: 18),
                const SizedBox(width: 6),
                Text(
                  'Select Download Option (${_links.length}):',
                  style: const TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          );
        }

        final link = _links[idx - 1];
        return _linkButton(link);
      },
    );
  }

  Widget _linkButton(DownloadLink link) {
    final hasResolution = link.resolution != 'LINK' && link.resolution != 'Unknown';
    final resColor = _resolutionColor(link.resolution);
    final sizeText = _extractFileSize(link.text);

    return GestureDetector(
      onTap: () => _resolveLink(link),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: AppTheme.bgSurface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: resColor.withOpacity(0.35)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.2),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // Left Box Container: Resolution Badge + File Size Just Below It
            Container(
              constraints: const BoxConstraints(minWidth: 64),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: resColor.withOpacity(0.18),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: resColor.withOpacity(0.4)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Resolution Badge or Download Icon
                  hasResolution
                      ? Text(
                          link.resolution,
                          style: TextStyle(
                            color: resColor,
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                          ),
                        )
                      : Icon(Icons.download_rounded, color: resColor, size: 20),

                  // File Size Just Below Resolution
                  if (sizeText != null && sizeText.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      sizeText,
                      style: TextStyle(
                        color: resColor.withOpacity(0.95),
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 14),
            // Middle Content: Main Heading Text + Bold Button Server Label Below on New Line
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    link.text,
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      height: 1.35,
                    ),
                  ),
                  if (link.buttonLabel != null &&
                      link.buttonLabel!.isNotEmpty &&
                      !link.text.toLowerCase().contains(link.buttonLabel!.toLowerCase())) ...[
                    const SizedBox(height: 5),
                    Text(
                      link.buttonLabel!,
                      style: TextStyle(
                        color: resColor,
                        fontSize: 12,
                        fontWeight: FontWeight.w800, // BOLD!
                        letterSpacing: 0.3,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right_rounded, color: resColor, size: 22),
          ],
        ),
      ),
    );
  }

  Widget _buildResolvingState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(color: AppTheme.accent),
            const SizedBox(height: 20),
            Text(
              _resolvingTotal > 1
                  ? 'Extracting Series Episodes ($_resolvingCurrent / $_resolvingTotal)'
                  : 'Fetching & resolving VCloud links...',
              style: const TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 15,
                  fontWeight: FontWeight.w600),
              textAlign: TextAlign.center,
            ),
            if (_selectedText != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.bgDark,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  _selectedText!,
                  style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
            const SizedBox(height: 16),
            if (_resolvingTotal > 1) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: _resolvingTotal > 0 ? _resolvingCurrent / _resolvingTotal : null,
                  backgroundColor: AppTheme.bgDark,
                  color: AppTheme.accent,
                  minHeight: 6,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Extracting Episode $_resolvingCurrent of $_resolvingTotal...',
                style: const TextStyle(color: AppTheme.accent, fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ] else ...[
              const Text(
                'Extracting direct links in sequence...',
                style: TextStyle(color: AppTheme.accent, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildResolvedResult(ScrollController scrollController) {
    final whatsappMsg = _generateWhatsAppMessage();

    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      children: [
        // Back button
        GestureDetector(
          onTap: () => setState(() {
            _resolvedUrls = [];
            _resolvedServerName = null;
            _isCopied = false;
          }),
          child: const Row(
            children: [
              Icon(Icons.arrow_back_ios_rounded,
                  color: AppTheme.accent, size: 16),
              SizedBox(width: 4),
              Text('Back to options',
                  style: TextStyle(color: AppTheme.accent, fontSize: 13)),
            ],
          ),
        ),
        const SizedBox(height: 14),

        // Resolved Status Header Container
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppTheme.success.withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppTheme.success.withOpacity(0.35)),
          ),
          child: Row(
            children: [
              const Icon(Icons.check_circle_rounded,
                  color: AppTheme.success, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Resolved ${_resolvedUrls.length} Direct Link(s) via ${_resolvedServerName ?? "VCloud"}',
                  style: const TextStyle(
                      color: AppTheme.success,
                      fontSize: 13,
                      fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 16),

        if (whatsappMsg.isNotEmpty) ...[
          // ACTION BUTTONS (Copy Command & Share) — PLACED ABOVE THE LINK BOX!
          Row(
            children: [
              Expanded(
                child: _actionButton(
                  icon: _isCopied ? Icons.check_circle_rounded : Icons.copy_rounded,
                  label: _isCopied ? 'Command Copied!' : 'Copy Command',
                  color: _isCopied ? const Color(0xFF25D366) : AppTheme.accent,
                  onTap: () => _copyToClipboard(whatsappMsg),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _actionButton(
                  icon: Icons.share_rounded,
                  label: 'Share',
                  color: const Color(0xFF25D366),
                  onTap: _shareToWhatsApp,
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // WHATSAPP BOT COMMAND PREVIEW BOX — PLACED BELOW THE BUTTONS!
          const Text('WhatsApp Bot Command:',
              style: TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Container(
            constraints: const BoxConstraints(minHeight: 100, maxHeight: 350),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.bgDark,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppTheme.accent.withOpacity(0.35)),
            ),
            child: Scrollbar(
              thumbVisibility: true,
              child: SingleChildScrollView(
                scrollDirection: Axis.vertical,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: SelectableText(
                    _generateDisplayMessage(),
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      height: 1.6,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _actionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: color.withOpacity(0.18),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.4)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 8),
            Text(label,
                style: TextStyle(
                    color: color, fontWeight: FontWeight.w700, fontSize: 13)),
          ],
        ),
      ),
    );
  }

  Color _resolutionColor(String res) {
    switch (res.toUpperCase()) {
      case '480P':
        return const Color(0xFFFF9800);
      case '720P':
        return const Color(0xFF4CAF50);
      case '1080P':
        return const Color(0xFF2196F3);
      case '2160P':
      case '4K':
        return const Color(0xFFE040FB);
      default:
        return AppTheme.accent;
    }
  }
}
