import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // STRICT 4-COLOR PALETTE ONLY (No pure #FFFFFF, no pure #000000)
  static const Color emeraldInk = Color(0xFF064E3B);  // Primary Rich Emerald (#064E3B)
  static const Color champagne  = Color(0xFFF8E7C9);  // Golden Warm Champagne (#F8E7C9)
  static const Color offBlack   = Color(0xFF0B1210);  // Dark Soft Emerald Black (#0B1210)
  static const Color offWhite   = Color(0xFFF4F4F0);  // Soft Warm Off-White (#F4F4F0)

  // Surface Tones derived from Off-Black & Emerald Ink
  static const Color bgDark    = offBlack;
  static const Color bgCard    = Color(0xFF101B17); // Dark Emerald Ink Tint
  static const Color bgSurface = Color(0xFF14241F); // Elevated Dark Emerald Surface
  static const Color bgModal   = Color(0xFF0D1714); // Modal Dark Background

  // Text Colors
  static const Color textPrimary   = champagne; // Warm Champagne for main text
  static const Color textSecondary = offWhite;  // Soft Off-White for body text
  static const Color textMuted     = Color(0xFF8A9C93); // Muted tint

  // Divider & Accents
  static const Color divider   = Color(0xFF1D322A);
  static const Color accent    = emeraldInk;
  static const Color success   = emeraldInk;
  static const Color error     = emeraldInk;

  // Site accent colors (All mapped to Emerald Ink & Champagne)
  static const Color vegaGreen = emeraldInk;
  static const Color rogOrange = champagne;
  static const Color hdhubBlue = emeraldInk;

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: bgDark,
      colorScheme: const ColorScheme.dark(
        primary: emeraldInk,
        secondary: champagne,
        surface: bgSurface,
        error: emeraldInk,
      ),
      textTheme: GoogleFonts.interTextTheme(
        const TextTheme(
          displayLarge: TextStyle(color: champagne, fontWeight: FontWeight.w800),
          displayMedium: TextStyle(color: champagne, fontWeight: FontWeight.w700),
          titleLarge: TextStyle(color: champagne, fontWeight: FontWeight.w700, fontSize: 20),
          titleMedium: TextStyle(color: champagne, fontWeight: FontWeight.w600, fontSize: 16),
          bodyLarge: TextStyle(color: champagne, fontSize: 15),
          bodyMedium: TextStyle(color: offWhite, fontSize: 14),
          bodySmall: TextStyle(color: textMuted, fontSize: 12),
          labelLarge: TextStyle(color: champagne, fontWeight: FontWeight.w700),
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: bgDark,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: GoogleFonts.inter(
          color: champagne,
          fontSize: 22,
          fontWeight: FontWeight.w800,
        ),
        iconTheme: const IconThemeData(color: emeraldInk),
      ),
      cardTheme: CardThemeData(
        color: bgCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
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
        color: champagne,
      ),
    );
  }

  // Gradients strictly built from Emerald Ink & Champagne & Off-Black
  static const LinearGradient emeraldGradient = LinearGradient(
    colors: [emeraldInk, Color(0xFF04382A)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient champagneGradient = LinearGradient(
    colors: [champagne, Color(0xFFE8D4B0)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient cardGradient = LinearGradient(
    colors: [Color(0xFF14241F), Color(0xFF0D1714)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
}
