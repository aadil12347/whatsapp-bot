import 'package:flutter/material.dart';
import '../models/site_config.dart';
import '../theme/app_theme.dart';

/// Floating action button that shows a popup to switch between sites
class SiteSwitcherFab extends StatelessWidget {
  final MovieSite currentSite;
  final Function(MovieSite) onSiteChanged;

  const SiteSwitcherFab({
    super.key,
    required this.currentSite,
    required this.onSiteChanged,
  });

  Color _siteColor(MovieSite site) {
    switch (site) {
      case MovieSite.vegamovies:
        return AppTheme.vegaGreen;
      case MovieSite.rogmovies:
        return AppTheme.rogOrange;
      case MovieSite.hdhub4u:
        return AppTheme.hdhubBlue;
    }
  }

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      backgroundColor: _siteColor(currentSite),
      onPressed: () => _showSitePicker(context),
      child: Text(
        currentSite.emoji,
        style: const TextStyle(fontSize: 22),
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
                  color: AppTheme.textMuted,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Switch Source',
                style: TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
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
    final isSelected = site == currentSite;
    final color = _siteColor(site);

    return GestureDetector(
      onTap: () {
        Navigator.pop(context);
        onSiteChanged(site);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        decoration: BoxDecoration(
          color: isSelected ? color.withOpacity(0.15) : AppTheme.bgSurface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? color : AppTheme.divider,
            width: isSelected ? 1.5 : 1,
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
                      color: isSelected ? color : AppTheme.textPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
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
              Icon(Icons.check_circle_rounded, color: color, size: 24),
          ],
        ),
      ),
    );
  }
}
