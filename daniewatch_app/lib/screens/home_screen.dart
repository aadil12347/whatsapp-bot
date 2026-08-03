import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../models/site_config.dart';
import '../theme/app_theme.dart';
import '../widgets/app_logo.dart';
import '../widgets/movie_card.dart';
import '../widgets/search_bar_widget.dart';
import '../widgets/site_switcher_fab.dart';
import '../widgets/resolution_modal.dart';

/// Main home screen with search bar, movie list, infinite scroll, and site switcher FAB.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _scrollController = ScrollController();
  DateTime? _lastBackPressTime;

  @override
  void initState() {
    super.initState();
    // Load homepage on first launch
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().loadHomepage(refresh: true);
    });

    // Infinite scroll listener
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 300) {
        context.read<AppState>().loadNextPage();
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _handleBackPress() {
    FocusScope.of(context).unfocus();

    final state = context.read<AppState>();
    if (state.isSearchMode || state.searchQuery.isNotEmpty) {
      state.exitSearch();
      return;
    }

    final now = DateTime.now();
    if (_lastBackPressTime == null ||
        now.difference(_lastBackPressTime!) > const Duration(milliseconds: 1500)) {
      _lastBackPressTime = now;
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Row(
            children: [
              Icon(Icons.info_outline_rounded, color: AppTheme.champagne, size: 18),
              SizedBox(width: 10),
              Text(
                'Press back again to exit',
                style: TextStyle(
                  color: AppTheme.champagne,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ],
          ),
          backgroundColor: AppTheme.emeraldInk,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          duration: const Duration(milliseconds: 1500),
        ),
      );
    } else {
      SystemNavigator.pop();
    }
  }

  Color _siteAccentColor(MovieSite site) {
    switch (site) {
      case MovieSite.vegamovies:
        return AppTheme.champagne;
      case MovieSite.rogmovies:
        return AppTheme.emeraldInk;
      case MovieSite.hdhub4u:
        return AppTheme.champagne;
    }
  }

  void _openResolutionModal(String postUrl, String title) {
    FocusScope.of(context).unfocus();
    final state = context.read<AppState>();
    if (state.isSearchMode) {
      state.exitSearch();
    }
    final site = state.currentSite;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ResolutionModal(
        postUrl: postUrl,
        movieTitle: title,
        accentColor: _siteAccentColor(site),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, state, _) {
        final accent = _siteAccentColor(state.currentSite);

        return PopScope(
          canPop: false,
          onPopInvokedWithResult: (didPop, result) {
            if (didPop) return;
            _handleBackPress();
          },
          child: GestureDetector(
            onTap: () {
              FocusScope.of(context).unfocus();
              if (state.isSearchMode && state.searchQuery.isEmpty) {
                state.exitSearch();
              }
            },
            behavior: HitTestBehavior.translucent,
            child: Scaffold(
              backgroundColor: AppTheme.bgDark,
              body: SafeArea(
                child: Stack(
                  children: [
                    // Content sliding underneath search bar on scroll
                    _buildContent(state, accent),

                    // Floating 3D Glassmorphism Search Bar at the very top
                    Positioned(
                      top: 0,
                      left: 0,
                      right: 0,
                      child: SearchBarWidget(
                        onSearch: (q) => state.search(q),
                        onClear: () => state.exitSearch(),
                        isSearchMode: state.isSearchMode,
                        currentQuery: state.searchQuery,
                      ),
                    ),
                  ],
                ),
              ),
              floatingActionButton: SiteSwitcherFab(
                currentSite: state.currentSite,
                onSiteChanged: (site) => state.switchSite(site),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildHeader(AppState state, Color accent) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 4),
      child: Row(
        children: [
          const AppLogo(size: 38),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'DanieWatch Extractor',
                style: TextStyle(
                  color: AppTheme.champagne,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.5,
                ),
              ),
              Row(
                children: [
                  Container(
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(
                      color: accent,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: accent.withOpacity(0.6),
                          blurRadius: 4,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    state.currentSite.displayName,
                    style: TextStyle(
                      color: accent,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const Spacer(),
          if (state.isSearchMode)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: accent.withOpacity(0.18),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: accent.withOpacity(0.3)),
              ),
              child: Text(
                'SEARCH',
                style: TextStyle(
                  color: accent,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildContent(AppState state, Color accent) {
    // Loading state
    if (state.isLoading || state.isSearching) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: accent),
            const SizedBox(height: 16),
            Text(
              state.isSearching
                  ? 'Searching ${state.currentSite.displayName}...'
                  : 'Loading ${state.currentSite.displayName}...',
              style: const TextStyle(color: AppTheme.textSecondary),
            ),
          ],
        ),
      );
    }

    // Error with no data
    if (state.error != null && state.movies.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline_rounded,
                  color: AppTheme.error, size: 48),
              const SizedBox(height: 16),
              Text(
                state.error!,
                style: const TextStyle(color: AppTheme.textSecondary),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: () => state.loadHomepage(refresh: true),
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Retry'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: accent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          ),
        ),
      );
    }

    // Movie list
    return RefreshIndicator(
      color: accent,
      onRefresh: () => state.isSearchMode
          ? state.search(state.searchQuery)
          : state.loadHomepage(refresh: true),
      child: ListView.builder(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: state.movies.length + (state.isLoadingMore ? 1 : 0),
        padding: const EdgeInsets.only(top: 72, bottom: 100),
        itemBuilder: (ctx, index) {
          // Loading indicator at bottom
          if (index == state.movies.length) {
            return Padding(
              padding: const EdgeInsets.all(20),
              child: Center(
                child: CircularProgressIndicator(
                    color: accent, strokeWidth: 2),
              ),
            );
          }

          final movie = state.movies[index];
          return MovieCard(
            movie: movie,
            accentColor: accent,
            onTap: () => _openResolutionModal(movie.postUrl, movie.title),
          );
        },
      ),
    );
  }
}
