import 'package:shared_preferences/shared_preferences.dart';

/// Site configuration for supported movie websites
enum MovieSite {
  vegamovies,
  rogmovies,
  hdhub4u,
}

class SiteDomainManager {
  static final Map<MovieSite, String> _customDomains = {};

  static const Map<MovieSite, String> defaultDomains = {
    MovieSite.vegamovies: 'https://new2.vegamovies.futbol/',
    MovieSite.rogmovies: 'https://new2.rogmovies.click/',
    MovieSite.hdhub4u: 'https://new3.hdhub4u.cl/',
  };

  static Future<void> loadCustomDomains() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      for (final site in MovieSite.values) {
        final saved = prefs.getString('custom_domain_${site.name}');
        if (saved != null && saved.trim().isNotEmpty) {
          _customDomains[site] = _ensureTrailingSlash(saved.trim());
        }
      }
    } catch (_) {}
  }

  static Future<void> setCustomDomain(MovieSite site, String url) async {
    final formatted = _ensureTrailingSlash(url.trim());
    _customDomains[site] = formatted;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('custom_domain_${site.name}', formatted);
    } catch (_) {}
  }

  static String getDomain(MovieSite site) {
    final d = _customDomains[site] ?? defaultDomains[site]!;
    return d.endsWith('/') ? d.substring(0, d.length - 1) : d;
  }

  static String _ensureTrailingSlash(String url) {
    var result = url;
    if (!result.startsWith('http://') && !result.startsWith('https://')) {
      result = 'https://$result';
    }
    if (!result.endsWith('/')) {
      result = '$result/';
    }
    return result;
  }
}

extension MovieSiteExtension on MovieSite {
  String get displayName {
    switch (this) {
      case MovieSite.vegamovies:
        return 'VegaMovies';
      case MovieSite.rogmovies:
        return 'RogMovies';
      case MovieSite.hdhub4u:
        return 'HDHub4u';
    }
  }

  String get domain {
    return SiteDomainManager.getDomain(this);
  }

  String get accentColorHex {
    switch (this) {
      case MovieSite.vegamovies:
        return '#064E3B';
      case MovieSite.rogmovies:
        return '#F8E7C9';
      case MovieSite.hdhub4u:
        return '#064E3B';
    }
  }
}
