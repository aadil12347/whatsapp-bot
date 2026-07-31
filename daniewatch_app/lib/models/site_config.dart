/// Site configuration for supported movie websites
enum MovieSite {
  vegamovies,
  rogmovies,
  hdhub4u,
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
    switch (this) {
      case MovieSite.vegamovies:
        return 'https://vegamovies.navy';
      case MovieSite.rogmovies:
        return 'https://rogmovies.rest';
      case MovieSite.hdhub4u:
        return 'https://new3.hdhub4u.cl';
    }
  }

  String get emoji {
    switch (this) {
      case MovieSite.vegamovies:
        return '🎬';
      case MovieSite.rogmovies:
        return '🎥';
      case MovieSite.hdhub4u:
        return '📺';
    }
  }

  String get accentColorHex {
    switch (this) {
      case MovieSite.vegamovies:
        return '#4CAF50';
      case MovieSite.rogmovies:
        return '#FF9800';
      case MovieSite.hdhub4u:
        return '#2196F3';
    }
  }
}
