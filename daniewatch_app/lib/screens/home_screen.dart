import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../models/site_config.dart';
import '../theme/app_theme.dart';
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

  Color _siteAccentColor(MovieSite site) {
    switch (site) {
      case MovieSite.vegamovies:
        return AppTheme.vegaGreen;
      case MovieSite.rogmovies:
        return AppTheme.rogOrange;
      case MovieSite.hdhub4u:
        return AppTheme.hdhubBlue;
    }
  }

  void _openResolutionModal(String postUrl, String title) {
    final site = context.read<AppState>().currentSite;
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

        return Scaffold(
          backgroundColor: AppTheme.bgDark,
          body: SafeArea(
            child: Column(
              children: [
                // App header
                _buildHeader(state, accent),
                // Search bar
                SearchBarWidget(
                  onSearch: (q) => state.search(q),
                  onClear: () => state.exitSearch(),
                  isSearchMode: state.isSearchMode,
                  currentQuery: state.searchQuery,
                ),
                // Content
                Expanded(child: _buildContent(state, accent)),
              ],
            ),
          ),
          floatingActionButton: SiteSwitcherFab(
            currentSite: state.currentSite,
            onSiteChanged: (site) => state.switchSite(site),
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
          // App logo
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [accent.withOpacity(0.3), accent.withOpacity(0.1)],
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.play_circle_filled_rounded,
                color: accent, size: 26),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'DanieWatch',
                style: TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              Row(
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: accent,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    state.currentSite.displayName,
                    style: TextStyle(
                      color: accent,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
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
                color: accent.withOpacity(0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'SEARCH',
                style: TextStyle(
                  color: accent,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
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
        padding: const EdgeInsets.only(bottom: 100),
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
