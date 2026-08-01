import 'package:flutter/material.dart';
import '../models/site_config.dart';
import '../theme/app_theme.dart';

/// Compact floating chip switcher styled strictly with 3 lines icon & clean text.
/// Supports tap & hold (long-press) to edit and save custom domain URLs.
class SiteSwitcherFab extends StatefulWidget {
  final MovieSite currentSite;
  final Function(MovieSite) onSiteChanged;

  const SiteSwitcherFab({
    super.key,
    required this.currentSite,
    required this.onSiteChanged,
  });

  @override
  State<SiteSwitcherFab> createState() => _SiteSwitcherFabState();
}

class _SiteSwitcherFabState extends State<SiteSwitcherFab> {
  bool _isPressed = false;

  Widget _buildThreeLinesIcon() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 8,
          height: 2,
          decoration: BoxDecoration(
            color: AppTheme.champagne,
            borderRadius: BorderRadius.circular(1),
          ),
        ),
        const SizedBox(height: 2.5),
        Container(
          width: 12,
          height: 2,
          decoration: BoxDecoration(
            color: AppTheme.champagne,
            borderRadius: BorderRadius.circular(1),
          ),
        ),
        const SizedBox(height: 2.5),
        Container(
          width: 16,
          height: 2,
          decoration: BoxDecoration(
            color: AppTheme.champagne,
            borderRadius: BorderRadius.circular(1),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) => setState(() => _isPressed = false),
      onTapCancel: () => setState(() => _isPressed = false),
      onTap: () => _showSitePicker(context),
      child: AnimatedScale(
        scale: _isPressed ? 0.92 : 1.0,
        duration: const Duration(milliseconds: 140),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            color: AppTheme.emeraldInk,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: AppTheme.champagne.withOpacity(0.5),
              width: 1.2,
            ),
            boxShadow: [
              BoxShadow(
                color: AppTheme.offBlack.withOpacity(0.6),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
              BoxShadow(
                color: AppTheme.emeraldInk.withOpacity(0.4),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildThreeLinesIcon(),
              const SizedBox(width: 8),
              Text(
                widget.currentSite.displayName,
                style: const TextStyle(
                  color: AppTheme.champagne,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showSitePicker(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.bgModal,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle bar
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppTheme.champagne.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Switch Source',
                style: TextStyle(
                  color: AppTheme.champagne,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Hold (tap & long-press) any card to edit URL',
                style: TextStyle(
                  color: AppTheme.champagne.withOpacity(0.6),
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 16),
              ...MovieSite.values.map((site) => _siteOption(ctx, site)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _siteOption(BuildContext context, MovieSite site) {
    final isSelected = site == widget.currentSite;

    return GestureDetector(
      onTap: () {
        Navigator.pop(context);
        widget.onSiteChanged(site);
      },
      onLongPress: () {
        Navigator.pop(context);
        _showEditUrlDialog(context, site);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.emeraldInk.withOpacity(0.35) : AppTheme.bgSurface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? AppTheme.champagne : AppTheme.emeraldInk.withOpacity(0.4),
            width: isSelected ? 1.8 : 1.0,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        site.displayName,
                        style: TextStyle(
                          color: isSelected ? AppTheme.champagne : AppTheme.offWhite,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(
                        Icons.edit_note_rounded,
                        color: AppTheme.champagne.withOpacity(0.5),
                        size: 16,
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    site.domain,
                    style: const TextStyle(
                        color: AppTheme.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            if (isSelected)
              const Icon(Icons.check_circle_rounded, color: AppTheme.champagne, size: 22),
          ],
        ),
      ),
    );
  }

  void _showEditUrlDialog(BuildContext context, MovieSite site) {
    final controller = TextEditingController(text: site.domain);

    showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        backgroundColor: AppTheme.bgModal,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: AppTheme.champagne.withOpacity(0.4)),
        ),
        title: Row(
          children: [
            const Icon(Icons.edit_rounded, color: AppTheme.champagne, size: 20),
            const SizedBox(width: 8),
            Text(
              'Edit ${site.displayName} URL',
              style: const TextStyle(
                color: AppTheme.champagne,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Enter new website domain URL:',
              style: TextStyle(color: AppTheme.offWhite, fontSize: 13),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: AppTheme.offBlack,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.champagne.withOpacity(0.4)),
              ),
              child: TextField(
                controller: controller,
                style: const TextStyle(color: AppTheme.champagne, fontSize: 13),
                decoration: const InputDecoration(
                  border: InputBorder.none,
                  hintText: 'https://...',
                  hintStyle: TextStyle(color: AppTheme.textMuted),
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx),
            child: const Text('Cancel', style: TextStyle(color: AppTheme.textMuted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.emeraldInk,
              foregroundColor: AppTheme.champagne,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
                side: BorderSide(color: AppTheme.champagne.withOpacity(0.4)),
              ),
            ),
            onPressed: () async {
              final newUrl = controller.text.trim();
              if (newUrl.isNotEmpty) {
                Navigator.pop(dialogCtx);
                await SiteDomainManager.setCustomDomain(site, newUrl);
                widget.onSiteChanged(site);

                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Row(
                        children: [
                          const Icon(Icons.check_circle_rounded, color: AppTheme.champagne, size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '${site.displayName} URL updated!',
                              style: const TextStyle(color: AppTheme.champagne, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ],
                      ),
                      backgroundColor: AppTheme.emeraldInk,
                      behavior: SnackBarBehavior.floating,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  );
                }
              }
            },
            child: const Text('Save Domain', style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }
}
