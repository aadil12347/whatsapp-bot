import 'package:flutter/material.dart';
import '../models/movie_item.dart';
import '../theme/app_theme.dart';

/// Landscape movie card: poster on LEFT, full title on RIGHT.
class MovieCard extends StatelessWidget {
  final MovieItem movie;
  final VoidCallback onTap;
  final Color accentColor;

  const MovieCard({
    super.key,
    required this.movie,
    required this.onTap,
    this.accentColor = AppTheme.accent,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: BoxDecoration(
          color: AppTheme.bgCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.divider.withOpacity(0.4)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.3),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Row(
            children: [
              // Poster (LEFT)
              SizedBox(
                width: 100,
                height: 130,
                child: movie.thumbnail != null && movie.thumbnail!.isNotEmpty
                    ? Image.network(
                        movie.thumbnail!,
                        fit: BoxFit.cover,
                        loadingBuilder: (_, child, loadingProgress) {
                          if (loadingProgress == null) return child;
                          return Container(
                            color: AppTheme.bgSurface,
                            child: const Center(
                              child: Icon(Icons.movie_outlined,
                                  color: AppTheme.textMuted, size: 32),
                            ),
                          );
                        },
                        errorBuilder: (_, __, ___) => Container(
                          color: AppTheme.bgSurface,
                          child: const Center(
                            child: Icon(Icons.broken_image_outlined,
                                color: AppTheme.textMuted, size: 32),
                          ),
                        ),
                      )
                    : Container(
                        color: AppTheme.bgSurface,
                        child: const Center(
                          child: Icon(Icons.movie_outlined,
                              color: AppTheme.textMuted, size: 32),
                        ),
                      ),
              ),
              // Title (RIGHT)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        movie.title,
                        style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          height: 1.3,
                        ),
                        maxLines: 4,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: accentColor.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              'TAP TO VIEW',
                              style: TextStyle(
                                color: accentColor,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                          const Spacer(),
                          Icon(Icons.chevron_right_rounded,
                              color: AppTheme.textMuted, size: 20),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
