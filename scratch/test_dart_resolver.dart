import 'package:daniewatch_app/services/resolver_service.dart';

void main() async {
  print('=== Running ResolverService on Nexdrive Link in Dart Runtime ===');
  const nexUrl = 'https://nexdrive.fit/genxfm784776499361/';

  try {
    final result = await ResolverService.resolveAllEpisodes(nexUrl);
    print('Resolved Server Name: ${result.serverName}');
    print('Direct URLs count: ${result.directUrls.length}');
    for (int i = 0; i < result.directUrls.length; i++) {
      print('URL ${i+1}: ${result.directUrls[i]}');
    }
    print('\nWhatsApp Command:\n${result.toWhatsAppCommand()}');
  } catch (e, st) {
    print('Error: $e');
    print(st);
  }
}
