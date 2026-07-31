/// Model representing a download link option extracted from a detail post page.
class DownloadLink {
  final String text;
  final String href;
  final String resolution; // 480p, 720p, 1080p, 2160p, or LINK
  final String? heading;
  final String? buttonLabel;

  DownloadLink({
    required this.text,
    required this.href,
    required this.resolution,
    this.heading,
    this.buttonLabel,
  });

  factory DownloadLink.fromJson(Map<String, dynamic> json) {
    return DownloadLink(
      text: json['text'] as String? ?? '',
      href: json['href'] as String? ?? '',
      resolution: json['resolution'] as String? ?? 'LINK',
      heading: json['heading'] as String?,
      buttonLabel: json['buttonLabel'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'text': text,
        'href': href,
        'resolution': resolution,
        'heading': heading,
        'buttonLabel': buttonLabel,
      };
}
