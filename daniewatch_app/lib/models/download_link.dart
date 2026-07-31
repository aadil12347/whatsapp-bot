/// Represents a download link extracted from a post page
class DownloadLink {
  final String text;
  final String href;
  final String resolution;
  final String? episode;
  final String? heading;

  const DownloadLink({
    required this.text,
    required this.href,
    required this.resolution,
    this.episode,
    this.heading,
  });

  @override
  String toString() =>
      'DownloadLink(text: $text, resolution: $resolution, href: $href)';
}

/// Represents a resolved direct download link (from VCloud/HubCloud)
class ResolvedLink {
  final String serverName;
  final String directUrl;

  const ResolvedLink({
    required this.serverName,
    required this.directUrl,
  });
}
