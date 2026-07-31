import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // Core palette
  static const Color bgDark = Color(0xFF0D0D0D);
  static const Color bgCard = Color(0xFF1A1A2E);
  static const Color bgSurface = Color(0xFF16213E);
  static const Color bgModal = Color(0xFF1A1A2E);
  static const Color accent = Color(0xFF00D4AA);
  static const Color accentSecondary = Color(0xFF6C63FF);
  static const Color textPrimary = Color(0xFFEEEEEE);
  static const Color textSecondary = Color(0xFF9E9E9E);
  static const Color textMuted = Color(0xFF666666);
  static const Color divider = Color(0xFF2A2A3E);
  static const Color success = Color(0xFF4CAF50);
  static const Color error = Color(0xFFEF5350);
  static const Color warning = Color(0xFFFF9800);

  // Site accent colors
  static const Color vegaGreen = Color(0xFF4CAF50);
  static const Color rogOrange = Color(0xFFFF9800);
  static const Color hdhubBlue = Color(0xFF2196F3);

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: bgDark,
      colorScheme: const ColorScheme.dark(
        primary: accent,
        secondary: accentSecondary,
        surface: bgSurface,
        error: error,
      ),
      textTheme: GoogleFonts.interTextTheme(
        const TextTheme(
          displayLarge: TextStyle(color: textPrimary, fontWeight: FontWeight.w700),
          displayMedium: TextStyle(color: textPrimary, fontWeight: FontWeight.w600),
          titleLarge: TextStyle(color: textPrimary, fontWeight: FontWeight.w600, fontSize: 20),
          titleMedium: TextStyle(color: textPrimary, fontWeight: FontWeight.w500, fontSize: 16),
          bodyLarge: TextStyle(color: textPrimary, fontSize: 15),
          bodyMedium: TextStyle(color: textSecondary, fontSize: 14),
          bodySmall: TextStyle(color: textMuted, fontSize: 12),
          labelLarge: TextStyle(color: textPrimary, fontWeight: FontWeight.w600),
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: bgDark,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: GoogleFonts.inter(
          color: textPrimary,
          fontSize: 22,
          fontWeight: FontWeight.w700,
        ),
        iconTheme: const IconThemeData(color: accent),
      ),
      cardTheme: CardThemeData(
        color: bgCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: bgModal,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),
      dividerColor: divider,
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: accent,
      ),
    );
  }

  // Gradient for the app bar / headers
  static const LinearGradient headerGradient = LinearGradient(
    colors: [Color(0xFF1A1A2E), Color(0xFF0D0D0D)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  // Gradient for buttons
  static const LinearGradient buttonGradient = LinearGradient(
    colors: [accent, Color(0xFF00B894)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static BoxDecoration get glassDecoration => BoxDecoration(
        color: bgCard.withOpacity(0.7),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: divider.withOpacity(0.3)),
      );
}
