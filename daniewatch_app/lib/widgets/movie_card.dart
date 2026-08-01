import 'package:flutter/material.dart';
import '../models/movie_item.dart';
import '../theme/app_theme.dart';

/// Movie Card styled strictly with Emerald Ink (#064E3B) & Champagne (#F8E7C9).
class MovieCard extends StatefulWidget {
  final MovieItem movie;
  final VoidCallback onTap;
  final Color accentColor;

  const MovieCard({
    super.key,
    required this.movie,
    required this.onTap,
    this.accentColor = AppTheme.emeraldInk,
  });

  @override
  State<MovieCard> createState() => _MovieCardState();
}

class _MovieCardState extends State<MovieCard> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) => setState(() => _isPressed = false),
      onTapCancel: () => setState(() => _isPressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _isPressed ? 0.97 : 1.0,
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeInOutCubic,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          decoration: BoxDecoration(
            color: _isPressed ? AppTheme.emeraldInk.withOpacity(0.25) : AppTheme.bgCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: _isPressed
                  ? AppTheme.champagne.withOpacity(0.8)
                  : AppTheme.emeraldInk.withOpacity(0.4),
              width: _isPressed ? 1.5 : 1.0,
            ),
            boxShadow: [
              BoxShadow(
                color: AppTheme.offBlack.withOpacity(0.4),
                blurRadius: _isPressed ? 12 : 8,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Row(
              children: [
                // Poster image
                SizedBox(
                  width: 105,
                  height: 135,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (widget.movie.thumbnail != null &&
                          widget.movie.thumbnail!.isNotEmpty)
                        Image.network(
                          widget.movie.thumbnail!,
                          fit: BoxFit.cover,
                          loadingBuilder: (_, child, loadingProgress) {
                            if (loadingProgress == null) return child;
                            return Container(
                              color: AppTheme.bgSurface,
                              child: const Center(
                                child: Icon(Icons.movie_outlined,
                                    color: AppTheme.textMuted, size: 28),
                              ),
                            );
                          },
                          errorBuilder: (_, __, ___) => Container(
                            color: AppTheme.bgSurface,
                            child: const Center(
                              child: Icon(Icons.broken_image_outlined,
                                  color: AppTheme.textMuted, size: 28),
                            ),
                          ),
                        )
                      else
                        Container(
                          color: AppTheme.bgSurface,
                          child: const Center(
                            child: Icon(Icons.movie_outlined,
                                color: AppTheme.textMuted, size: 28),
                          ),
                        ),
                      Positioned(
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: 20,
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                Colors.transparent,
                                AppTheme.bgCard.withOpacity(0.7),
                              ],
                              begin: Alignment.centerLeft,
                              end: Alignment.centerRight,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                // Title and action label
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          widget.movie.title,
                          style: const TextStyle(
                            color: AppTheme.champagne,
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            height: 1.35,
                            letterSpacing: 0.1,
                          ),
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: AppTheme.emeraldInk,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                    color: AppTheme.champagne.withOpacity(0.3)),
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.play_arrow_rounded,
                                      color: AppTheme.champagne, size: 14),
                                  SizedBox(width: 2),
                                  Text(
                                    'VIEW LINKS',
                                    style: TextStyle(
                                      color: AppTheme.champagne,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const Spacer(),
                            const Icon(Icons.arrow_forward_ios_rounded,
                                color: AppTheme.champagne, size: 14),
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
      ),
    );
  }
}
