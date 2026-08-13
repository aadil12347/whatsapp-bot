import 'package:flutter/material.dart';
import 'home_screen.dart';
import 'bot_control_screen.dart';
import '../theme/app_theme.dart';

class MainTabScreen extends StatefulWidget {
  const MainTabScreen({super.key});

  @override
  State<MainTabScreen> createState() => _MainTabScreenState();
}

class _MainTabScreenState extends State<MainTabScreen> {
  int _currentIndex = 1; // Default to Bot Controller Tab for immediate bot management

  final List<Widget> _screens = const [
    HomeScreen(),
    BotControlScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgDark,
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppTheme.bgCard,
          border: Border(top: BorderSide(color: AppTheme.divider, width: 1)),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (index) {
            setState(() {
              _currentIndex = index;
            });
          },
          backgroundColor: AppTheme.bgCard,
          selectedItemColor: AppTheme.champagne,
          unselectedItemColor: AppTheme.textMuted,
          selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
          unselectedLabelStyle: const TextStyle(fontSize: 12),
          type: BottomNavigationBarType.fixed,
          elevation: 0,
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.movie_outlined),
              activeIcon: Icon(Icons.movie_rounded),
              label: 'Extractor',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.smart_toy_outlined),
              activeIcon: Icon(Icons.smart_toy_rounded),
              label: 'Bot Controller',
            ),
          ],
        ),
      ),
    );
  }
}
