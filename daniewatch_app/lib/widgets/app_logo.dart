import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../theme/app_theme.dart';

/// App Logo widget rendering the official SVG vector logo from file.svg
class AppLogo extends StatelessWidget {
  final double size;
  final bool showBackground;

  const AppLogo({
    super.key,
    this.size = 80.0,
    this.showBackground = true,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: AppTheme.emeraldInk.withOpacity(0.4),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: ClipOval(
        child: SvgPicture.asset(
          'assets/logo.svg',
          width: size,
          height: size,
          fit: BoxFit.cover,
        ),
      ),
    );
  }
}
