import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/download_link.dart';
import '../services/scraper_service.dart';
import '../services/resolver_service.dart';
import '../theme/app_theme.dart';

/// Modal bottom sheet displaying detail page download links.
/// Left box shows resolution badge (480p, 720p, 1080p, 2160p) with file size just below it.
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
  String? _resolvedUrl;
  String? _resolvedServerName;
  String? _selectedText;

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

      setState(() {
        _links = uniqueLinks;
        _loadingLinks = false;
        if (_links.isEmpty) {
          _error = 'No download links could be parsed from this page.';
        }
      });
    } catch (e) {
      setState(() {
        _loadingLinks = false;
        _error = 'Failed to load post page: $e';
      });
    }
  }

  Future<void> _resolveLink(DownloadLink link) async {
    setState(() {
      _resolving = true;
      _resolvedUrl = null;
      _resolvedServerName = null;
      _selectedText = link.text;
    });

    try {
      final resolved = await ResolverService.resolveWithFallback(link.href);
      setState(() {
        _resolving = false;
        _resolvedUrl = resolved.directUrl;
        _resolvedServerName = resolved.serverName;
      });
    } catch (e) {
      setState(() {
        _resolving = false;
        _resolvedUrl = link.href;
        _resolvedServerName = 'Direct Link';
      });
    }
  }

  /// Generate the WhatsApp .d command message
  String _generateWhatsAppMessage() {
    if (_resolvedUrl != null) {
      return '.d $_resolvedUrl';
    }
    return '';
  }

  void _copyToClipboard(String text) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('Copied to clipboard!'),
        backgroundColor: AppTheme.accent,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 2),
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
    if (_resolvedUrl != null) {
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
            // Complete Option Title
            Expanded(
              child: Text(
                link.text,
                style: const TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  height: 1.35,
                ),
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
            const Text(
              'Fetching & resolving download link...',
              style: TextStyle(
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
            const Text(
              'Extracting VCloud / direct server...',
              style: TextStyle(color: AppTheme.accent, fontSize: 12),
            ),
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
            _resolvedUrl = null;
            _resolvedServerName = null;
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

        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppTheme.success.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppTheme.success.withOpacity(0.3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.check_circle_rounded,
                      color: AppTheme.success, size: 18),
                  const SizedBox(width: 8),
                  Text(
                    'Resolved via ${_resolvedServerName ?? "Direct Server"}',
                    style: const TextStyle(
                        color: AppTheme.success,
                        fontSize: 13,
                        fontWeight: FontWeight.w600),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _resolvedUrl!,
                style: const TextStyle(
                    color: AppTheme.textSecondary, fontSize: 11),
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),

        const SizedBox(height: 16),

        // WhatsApp command preview
        if (whatsappMsg.isNotEmpty) ...[
          const Text('WhatsApp Bot Command:',
              style: TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w500)),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.bgDark,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppTheme.divider),
            ),
            child: Text(
              whatsappMsg,
              style: const TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 12,
                  fontFamily: 'monospace'),
              maxLines: 8,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(height: 16),

          // Action buttons
          Row(
            children: [
              Expanded(
                child: _actionButton(
                  icon: Icons.copy_rounded,
                  label: 'Copy Command',
                  color: AppTheme.accent,
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
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: color.withOpacity(0.15),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 8),
            Text(label,
                style: TextStyle(
                    color: color, fontWeight: FontWeight.w600, fontSize: 13)),
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
