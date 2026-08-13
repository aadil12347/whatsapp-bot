import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'models/site_config.dart';
import 'providers/app_state.dart';
import 'providers/bot_provider.dart';
import 'theme/app_theme.dart';
import 'screens/main_tab_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SiteDomainManager.loadCustomDomains();

  // Initialize Supabase with default or environment-defined credentials
  const supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://xyzcompany.supabase.co',
  );
  const supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key',
  );

  try {
    await Supabase.initialize(
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    );
  } catch (e) {
    print('Supabase initialization warning: $e');
  }

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: AppTheme.bgDark,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  runApp(const DanieWatchApp());
}

class DanieWatchApp extends StatelessWidget {
  const DanieWatchApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AppState()),
        ChangeNotifierProvider(create: (_) => BotProvider()),
      ],
      child: MaterialApp(
        title: 'DanieWatch & Bot Control',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        home: const MainTabScreen(),
      ),
    );
  }
}
