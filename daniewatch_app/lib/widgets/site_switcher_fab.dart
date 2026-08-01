import 'package:flutter/material.dart';
import '../models/site_config.dart';
import '../theme/app_theme.dart';

/// Source switcher FAB styled strictly with Emerald Ink & Champagne.
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

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) => setState(() => _isPressed = false),
      onTapCancel: () => setState(() => _isPressed = false),
      child: AnimatedScale(
        scale: _isPressed ? 0.90 : 1.0,
        duration: const Duration(milliseconds: 140),
        child: FloatingActionButton.extended(
          elevation: 6,
          highlightElevation: 10,
          backgroundColor: AppTheme.emeraldInk,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: AppTheme.champagne.withOpacity(0.4)),
          ),
          onPressed: () => _showSitePicker(context),
          icon: Text(
            widget.currentSite.emoji,
            style: const TextStyle(fontSize: 20),
          ),
          label: Text(
            widget.currentSite.displayName,
            style: const TextStyle(
              color: AppTheme.champagne,
              fontSize: 13,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.3,
            ),
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
              const SizedBox(height: 20),
              const Text(
                'Switch Source',
                style: TextStyle(
                  color: AppTheme.champagne,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
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
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.emeraldInk.withOpacity(0.3) : AppTheme.bgSurface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? AppTheme.champagne : AppTheme.emeraldInk.withOpacity(0.4),
            width: isSelected ? 1.8 : 1.0,
          ),
        ),
        child: Row(
          children: [
            Text(site.emoji, style: const TextStyle(fontSize: 24)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    site.displayName,
                    style: TextStyle(
                      color: isSelected ? AppTheme.champagne : AppTheme.offWhite,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    Uri.parse(site.domain).host,
                    style: const TextStyle(
                        color: AppTheme.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            if (isSelected)
              const Icon(Icons.check_circle_rounded, color: AppTheme.champagne, size: 24),
          ],
        ),
      ),
    );
  }
}
