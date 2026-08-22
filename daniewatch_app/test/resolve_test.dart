import 'package:flutter_test/flutter_test.dart';
import 'package:daniewatch_app/services/resolver_service.dart';

void main() {
  test('Test single movie resolution for Lenin Nextdrive option 1', () async {
    const nexUrl = 'https://nexdrive.fit/genxfm784776503650/';
    print('Testing single resolution for: $nexUrl');

    final result = await ResolverService.resolveWithFallback(nexUrl);
    print('=== SINGLE MOVIE RESOLUTION RESULT ===');
    print('Server Name: ${result.serverName}');
    print('Direct URL : ${result.directUrl}');

    expect(result.directUrl.startsWith('http'), isTrue);
  }, timeout: const Timeout(Duration(seconds: 45)));
}
