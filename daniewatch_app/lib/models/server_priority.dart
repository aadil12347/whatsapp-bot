import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Download server options for VCloud fallback priority.
/// Only the 3 primary servers are configurable.
enum DownloadServer {
  fsl,
  fslv2,
  tenGbps,
}

extension DownloadServerExtension on DownloadServer {
  /// Human-readable display name shown in the settings UI
  String get displayName {
    switch (this) {
      case DownloadServer.fsl:
        return 'FSL';
      case DownloadServer.fslv2:
        return 'FSLv2';
      case DownloadServer.tenGbps:
        return '10Gbps (G-Direct)';
    }
  }

  /// Short description of the server
  String get description {
    switch (this) {
      case DownloadServer.fsl:
        return 'Standard fast server link';
      case DownloadServer.fslv2:
        return 'Fast server link v2';
      case DownloadServer.tenGbps:
        return 'High-speed 10Gbps direct link';
    }
  }

  /// Returns true if the combined server name + URL text matches this server
  bool matches(String text) {
    switch (this) {
      case DownloadServer.fsl:
        // Match "fsl" but NOT "fslv2"
        return (text.contains('fsl') && !text.contains('fslv2'));
      case DownloadServer.fslv2:
        return text.contains('fslv2');
      case DownloadServer.tenGbps:
        return text.contains('10gbps') ||
            text.contains('10 gbps') ||
            text.contains('g-direct') ||
            text.contains('gdirect') ||
            text.contains('gpdl');
    }
  }
}

/// Manages the user's download server priority order.
/// Persists to SharedPreferences so the order survives app restarts.
class ServerPriorityManager {
  static const String _prefsKey = 'server_priority_order';

  /// Default order: FSL → FSLv2 → 10Gbps
  static const List<DownloadServer> defaultOrder = [
    DownloadServer.fsl,
    DownloadServer.fslv2,
    DownloadServer.tenGbps,
  ];

  static List<DownloadServer> _currentOrder = List.from(defaultOrder);

  /// Get the current server priority order
  static List<DownloadServer> getOrder() => List.unmodifiable(_currentOrder);

  /// Load saved order from SharedPreferences (call once at app startup)
  static Future<void> loadSavedOrder() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_prefsKey);
      if (saved != null && saved.isNotEmpty) {
        final List<dynamic> decoded = jsonDecode(saved);
        final order = <DownloadServer>[];
        for (final name in decoded) {
          try {
            order.add(DownloadServer.values.byName(name as String));
          } catch (_) {}
        }
        // Ensure all servers are present (add any missing ones at the end)
        for (final server in DownloadServer.values) {
          if (!order.contains(server)) {
            order.add(server);
          }
        }
        _currentOrder = order;
      }
    } catch (_) {
      _currentOrder = List.from(defaultOrder);
    }
  }

  /// Save a new custom order
  static Future<void> setOrder(List<DownloadServer> order) async {
    _currentOrder = List.from(order);
    try {
      final prefs = await SharedPreferences.getInstance();
      final encoded = jsonEncode(order.map((s) => s.name).toList());
      await prefs.setString(_prefsKey, encoded);
    } catch (_) {}
  }

  /// Reset to default order
  static Future<void> resetToDefault() async {
    await setOrder(List.from(defaultOrder));
  }

  /// Get a short display string for the current order (e.g., "FSL → FSLv2 → 10Gbps")
  static String getOrderDisplayString() {
    return _currentOrder.map((s) => s.displayName).join(' → ');
  }
}
