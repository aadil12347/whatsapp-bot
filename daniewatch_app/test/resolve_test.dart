import 'package:flutter_test/flutter_test.dart';
import 'package:daniewatch_app/services/resolver_service.dart';

void main() {
  test('Test nexdrive extraction for all episodes', () async {
    const landingUrl = 'https://nexdrive.fit/genxfm784776495266/';
    print('Testing resolution for: $landingUrl');

    final result = await ResolverService.resolveAllEpisodes(
      landingUrl,
      onProgress: (current, total, isDone) {
        print('Progress: $current / $total (done: $isDone)');
      },
    );

    print('=== RESOLUTION RESULT ===');
    print('Server Name: ${result.serverName}');
    print('Total Direct URLs: ${result.directUrls.length}');
    for (int i = 0; i < result.directUrls.length; i++) {
      print('Episode ${i + 1}: ${result.directUrls[i]}');
    }
  });
}
