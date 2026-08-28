import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/download_link.dart';
import '../services/scraper_service.dart';
import '../services/resolver_service.dart';
import '../services/tmdb_service.dart';
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

  // TMDB resolution state
  bool _loadingTmdb = true;
  TmdbResult? _tmdbResult;
  bool _tmdbCopied = false;

  // Episode selection state
  bool _fetchingEpisodes = false;
  bool _isEpisodeView = false;
  List<EpisodeItem> _episodes = [];
  final Set<int> _selectedEpisodeIndices = {};
  DownloadLink? _selectedQualityLink;

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
    _loadTmdbCommand();
  }

  Future<void> _loadTmdbCommand() async {
    try {
      final result = await TmdbService.resolveTmdbCommand(
        widget.postUrl,
        widget.movieTitle,
      );
      if (!mounted) return;
      setState(() {
        _tmdbResult = result;
        _loadingTmdb = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadingTmdb = false;
      });
    }
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

  /// Triggered when a Quality link is tapped
  Future<void> _onQualityLinkTapped(DownloadLink link) async {
    setState(() {
      _fetchingEpisodes = true;
      _selectedQualityLink = link;
      _selectedText = link.text;
      _error = null;
      _selectedEpisodeIndices.clear();
    });

    try {
      final episodes = await ResolverService.extractEpisodeLinks(link.href);

      if (!mounted) return;

      if (episodes.length > 1) {
        // Multi-episode series! Show Episode Cards list view with all episodes selected initially
        setState(() {
          _fetchingEpisodes = false;
          _isEpisodeView = true;
          _episodes = episodes;
          _selectedEpisodeIndices.addAll(List.generate(episodes.length, (i) => i));
        });
      } else {
        // Single movie link -> auto-resolve immediately
        setState(() {
          _fetchingEpisodes = false;
        });
        await _resolveEpisodeList(episodes.isNotEmpty
            ? episodes
            : [EpisodeItem(label: 'Movie', url: link.href, index: 1)]);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _fetchingEpisodes = false;
      });
      await _resolveEpisodeList([EpisodeItem(label: 'Movie', url: link.href, index: 1)]);
    }
  }

  /// Resolves direct links on-demand for selected episode(s)
  Future<void> _resolveEpisodeList(List<EpisodeItem> chosenEpisodes) async {
    setState(() {
      _resolving = true;
      _resolvingCurrent = 0;
      _resolvingTotal = chosenEpisodes.length;
      _resolvedUrls = [];
      _resolvedServerName = null;
      _isCopied = false;
    });

    try {
      final result = await ResolverService.resolveEpisodesList(
        chosenEpisodes,
        referer: _selectedQualityLink?.href,
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
        _resolvedUrls = result.directUrls.map((url) => ResolverService.applyPixeldrainWorkerProxy(url)).toList();
        _resolvedServerName = result.serverName;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _resolving = false;
        _resolvedUrls = chosenEpisodes.map((e) => ResolverService.applyPixeldrainWorkerProxy(e.url)).toList();
        _resolvedServerName = 'Direct Link';
      });
    }
  }

  /// Generate the WhatsApp .d command message: .d link1, link2, ...
  String _generateWhatsAppMessage() {
    if (_resolvedUrls.isNotEmpty) {
      final converted = _resolvedUrls.map((url) => ResolverService.applyPixeldrainWorkerProxy(url)).toList();
      return '.d ${converted.join(', ')}';
    }
    return '';
  }

  /// Format command for display in preview box (wrapped, readable)
  String _generateDisplayMessage() {
    if (_resolvedUrls.isNotEmpty) {
      final converted = _resolvedUrls.map((url) => ResolverService.applyPixeldrainWorkerProxy(url)).toList();
      if (converted.length == 1) {
        return '.d ${converted.first}';
      }
      // Multi-episode: show each link on a new line for readability
      final buffer = StringBuffer('.d ');
      for (int i = 0; i < converted.length; i++) {
        buffer.write(converted[i]);
        if (i < converted.length - 1) {
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
        content: const Row(
          children: [
            Icon(Icons.check_circle_rounded, color: AppTheme.champagne, size: 20),
            SizedBox(width: 10),
            Text(
              'WhatsApp Command Copied to Clipboard!',
              style: TextStyle(
                color: AppTheme.champagne,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ],
        ),
        backgroundColor: AppTheme.emeraldInk,
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
                TmdbService.formatDisplayTitle(widget.movieTitle),
                style: const TextStyle(
                  color: AppTheme.champagne,
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.1,
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

    if (_fetchingEpisodes) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: AppTheme.accent),
            SizedBox(height: 16),
            Text('Fetching VCloud episode links...',
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

    // Show episode selection cards if series
    if (_isEpisodeView) {
      return _buildEpisodeCards(scrollController);
    }

    // Show extracted download link buttons
    return _buildLinkButtons(scrollController);
  }

  Widget _buildEpisodeCards(ScrollController scrollController) {
    final resColor = _resolutionColor(_selectedQualityLink?.resolution ?? '720p');
    final allSelected = _selectedEpisodeIndices.length == _episodes.length;

    return Column(
      children: [
        // TMDB Command Card
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: _buildTmdbCard(),
        ),

        // Top Header Controls (Back button & Select All toggle)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
          child: Row(
            children: [
              GestureDetector(
                onTap: () => setState(() {
                  _isEpisodeView = false;
                  _episodes = [];
                  _selectedEpisodeIndices.clear();
                }),
                child: const Row(
                  children: [
                    Icon(Icons.arrow_back_ios_rounded, color: AppTheme.accent, size: 16),
                    SizedBox(width: 4),
                    Text('Back to resolutions', style: TextStyle(color: AppTheme.accent, fontSize: 13)),
                  ],
                ),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () {
                  setState(() {
                    if (allSelected) {
                      _selectedEpisodeIndices.clear();
                    } else {
                      _selectedEpisodeIndices.addAll(List.generate(_episodes.length, (i) => i));
                    }
                  });
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppTheme.accent.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppTheme.accent.withOpacity(0.4)),
                  ),
                  child: Text(
                    allSelected ? 'Deselect All' : 'Select All (${_episodes.length})',
                    style: const TextStyle(
                      color: AppTheme.accent,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),

        // Episode List
        Expanded(
          child: ListView.builder(
            controller: scrollController,
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            itemCount: _episodes.length,
            itemBuilder: (ctx, idx) {
              final ep = _episodes[idx];
              final isSelected = _selectedEpisodeIndices.contains(idx);

              return GestureDetector(
                onTap: () {
                  setState(() {
                    if (isSelected) {
                      _selectedEpisodeIndices.remove(idx);
                    } else {
                      _selectedEpisodeIndices.add(idx);
                    }
                  });
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: isSelected ? resColor.withOpacity(0.14) : AppTheme.bgSurface,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: isSelected ? resColor : resColor.withOpacity(0.2),
                      width: isSelected ? 1.8 : 1.0,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.15),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      // Checkbox
                      Icon(
                        isSelected ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded,
                        color: isSelected ? resColor : AppTheme.textMuted,
                        size: 22,
                      ),
                      const SizedBox(width: 12),
                      // Badge
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: isSelected ? resColor : resColor.withOpacity(0.18),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          ep.label,
                          style: TextStyle(
                            color: isSelected ? Colors.black : resColor,
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          isSelected ? 'Selected' : 'Tap to select',
                          style: TextStyle(
                            color: isSelected ? AppTheme.textPrimary : AppTheme.textMuted,
                            fontSize: 12,
                            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),

        // Bottom Sticky Action Bar: Extract Selected Links
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton.icon(
              onPressed: _selectedEpisodeIndices.isEmpty
                  ? null
                  : () {
                      final selectedEpisodes = _selectedEpisodeIndices.map((i) => _episodes[i]).toList();
                      _resolveEpisodeList(selectedEpisodes);
                    },
              icon: const Icon(Icons.flash_on_rounded, size: 20),
              label: Text(
                'Extract Selected (${_selectedEpisodeIndices.length} Episode${_selectedEpisodeIndices.length == 1 ? '' : 's'})',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.accent,
                foregroundColor: Colors.black,
                disabledBackgroundColor: AppTheme.bgSurface,
                disabledForegroundColor: AppTheme.textMuted,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                elevation: 4,
              ),
            ),
          ),
        ),
      ],
    );
  }

  void _copyTmdbToClipboard(String command) {
    Clipboard.setData(ClipboardData(text: command));
    setState(() {
      _tmdbCopied = true;
    });
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) {
        setState(() {
          _tmdbCopied = false;
        });
      }
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Row(
          children: [
            Icon(Icons.check_circle_rounded, color: AppTheme.champagne, size: 20),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'TMDB Command Copied! (.p <tmdb_url>)',
                style: TextStyle(
                  color: AppTheme.champagne,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
        backgroundColor: AppTheme.emeraldInk,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        duration: const Duration(seconds: 3),
      ),
    );
  }

  Widget _buildTmdbCard() {
    if (_loadingTmdb) {
      return Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppTheme.bgSurface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.emeraldInk.withOpacity(0.5)),
        ),
        child: const Row(
          children: [
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.champagne),
            ),
            SizedBox(width: 12),
            Text(
              'Fetching TMDB command...',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 12),
            ),
          ],
        ),
      );
    }

    if (_tmdbResult == null) return const SizedBox.shrink();

    final command = _tmdbResult!.command;
    final displayTitle = _tmdbResult!.title ?? widget.movieTitle;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppTheme.emeraldInk.withOpacity(0.95),
            AppTheme.bgCard,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.champagne.withOpacity(0.4), width: 1.2),
        boxShadow: [
          BoxShadow(
            color: AppTheme.offBlack.withOpacity(0.3),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Badge
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.champagne,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'TMDB POST',
                  style: TextStyle(
                    color: AppTheme.offBlack,
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'WhatsApp Bot Poster Command',
                  style: TextStyle(
                    color: AppTheme.offWhite.withOpacity(0.9),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Command Box displaying post title + Copy Button (Tapping copies .p link to clipboard)
          GestureDetector(
            onTap: () => _copyTmdbToClipboard(command),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppTheme.offBlack.withOpacity(0.6),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.champagne.withOpacity(0.2)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      displayTitle,
                      style: const TextStyle(
                        color: AppTheme.champagne,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: _tmdbCopied ? AppTheme.champagne : AppTheme.emeraldInk,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppTheme.champagne.withOpacity(0.3)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _tmdbCopied ? Icons.check_rounded : Icons.copy_rounded,
                          color: _tmdbCopied ? AppTheme.offBlack : AppTheme.champagne,
                          size: 14,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          _tmdbCopied ? 'Copied!' : 'Copy',
                          style: TextStyle(
                            color: _tmdbCopied ? AppTheme.offBlack : AppTheme.champagne,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLinkButtons(ScrollController scrollController) {
    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
      itemCount: _links.length + 2,
      itemBuilder: (ctx, idx) {
        if (idx == 0) {
          return _buildTmdbCard();
        }

        if (idx == 1) {
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

        final link = _links[idx - 2];
        return _linkButton(link);
      },
    );
  }

  Widget _linkButton(DownloadLink link) {
    final hasResolution = link.resolution != 'LINK' && link.resolution != 'Unknown';
    final resColor = _resolutionColor(link.resolution);
    final sizeText = _extractFileSize(link.text);

    return GestureDetector(
      onTap: () => _onQualityLinkTapped(link),
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
            const CircularProgressIndicator(color: AppTheme.champagne),
            const SizedBox(height: 20),
            Text(
              _resolvingTotal > 1
                  ? 'Extracting Series Episodes ($_resolvingCurrent / $_resolvingTotal)'
                  : 'Fetching & resolving VCloud links...',
              style: const TextStyle(
                  color: AppTheme.champagne,
                  fontSize: 15,
                  fontWeight: FontWeight.w700),
              textAlign: TextAlign.center,
            ),
            if (_selectedText != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.bgDark,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppTheme.champagne.withOpacity(0.2)),
                ),
                child: Text(
                  _selectedText!,
                  style: const TextStyle(color: AppTheme.offWhite, fontSize: 13),
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
                  color: AppTheme.champagne,
                  minHeight: 6,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Extracting Episode $_resolvingCurrent of $_resolvingTotal...',
                style: const TextStyle(color: AppTheme.champagne, fontSize: 13, fontWeight: FontWeight.w700),
              ),
            ] else ...[
              const Text(
                'Extracting direct links in sequence...',
                style: TextStyle(color: AppTheme.champagne, fontSize: 12, fontWeight: FontWeight.w600),
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
                  color: AppTheme.champagne, size: 16),
              SizedBox(width: 4),
              Text('Back to options',
                  style: TextStyle(color: AppTheme.champagne, fontSize: 13, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
        const SizedBox(height: 14),

        // Resolved Status Header Container - High contrast Emerald Ink background with Champagne text!
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppTheme.emeraldInk,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppTheme.champagne.withOpacity(0.4)),
            boxShadow: [
              BoxShadow(
                color: AppTheme.offBlack.withOpacity(0.3),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            children: [
              const Icon(Icons.check_circle_rounded,
                  color: AppTheme.champagne, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Resolved ${_resolvedUrls.length} Direct Link(s) via ${_resolvedServerName ?? "VCloud"}',
                  style: const TextStyle(
                      color: AppTheme.champagne,
                      fontSize: 13,
                      fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 16),

        if (whatsappMsg.isNotEmpty) ...[
          // ACTION BUTTONS (Copy Command & Share) — Strictly 4-color palette!
          Row(
            children: [
              Expanded(
                child: _actionButton(
                  icon: _isCopied ? Icons.check_circle_rounded : Icons.copy_rounded,
                  label: _isCopied ? 'Command Copied!' : 'Copy Command',
                  color: AppTheme.emeraldInk,
                  onTap: () => _copyToClipboard(whatsappMsg),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _actionButton(
                  icon: Icons.share_rounded,
                  label: 'Share',
                  color: AppTheme.emeraldInk,
                  onTap: _shareToWhatsApp,
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // WHATSAPP BOT COMMAND PREVIEW BOX — High contrast & Crystal Clear Readability!
          const Text('WhatsApp Bot Command:',
              style: TextStyle(
                  color: AppTheme.champagne,
                  fontSize: 13,
                  fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Container(
            constraints: const BoxConstraints(minHeight: 100, maxHeight: 350),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.offBlack,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppTheme.champagne.withOpacity(0.4), width: 1.2),
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
                      color: AppTheme.champagne,
                      fontSize: 13,
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w600,
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
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: AppTheme.emeraldInk,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.champagne.withOpacity(0.4)),
          boxShadow: [
            BoxShadow(
              color: AppTheme.offBlack.withOpacity(0.3),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: AppTheme.champagne, size: 18),
            const SizedBox(width: 6),
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  label,
                  style: const TextStyle(
                    color: AppTheme.champagne,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                  maxLines: 1,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color _resolutionColor(String res) {
    switch (res.toUpperCase()) {
      case '480P':
      case '720P':
      case '1080P':
      case '2160P':
      case '4K':
        return AppTheme.champagne;
      default:
        return AppTheme.emeraldInk;
    }
  }
}
