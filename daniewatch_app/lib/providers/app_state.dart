import 'package:flutter/material.dart';
import '../models/movie_item.dart';
import '../models/site_config.dart';
import '../services/scraper_service.dart';
import '../services/search_service.dart';

/// Central app state using ChangeNotifier
class AppState extends ChangeNotifier {
  MovieSite _currentSite = MovieSite.vegamovies;
  List<MovieItem> _movies = [];
  List<MovieItem> _searchResults = [];
  int _currentPage = 1;
  int _searchCurrentPage = 1;
  bool _isLoading = false;
  bool _isLoadingMore = false;
  bool _isSearching = false;
  bool _hasMorePages = true;
  String? _error;
  String _searchQuery = '';
  bool _isSearchMode = false;

  // Getters
  MovieSite get currentSite => _currentSite;
  List<MovieItem> get movies => _isSearchMode ? _searchResults : _movies;
  bool get isLoading => _isLoading;
  bool get isLoadingMore => _isLoadingMore;
  bool get isSearching => _isSearching;
  bool get hasMorePages => _hasMorePages;
  String? get error => _error;
  String get searchQuery => _searchQuery;
  bool get isSearchMode => _isSearchMode;

  /// Switch to a different site (or force reload if domain changed)
  Future<void> switchSite(MovieSite site, {bool forceReload = false}) async {
    if (_currentSite == site && !forceReload) return;
    _currentSite = site;
    _isSearchMode = false;
    _searchQuery = '';
    _searchResults = [];
    _movies = [];
    _error = null;
    notifyListeners();
    await loadHomepage(refresh: true);
  }

  /// Load the homepage (page 1 or refresh)
  Future<void> loadHomepage({bool refresh = false}) async {
    if (_isLoading) return;

    if (refresh) {
      _currentPage = 1;
      _hasMorePages = true;
      _error = null;
    }

    _isLoading = refresh || _movies.isEmpty;
    _error = null;
    notifyListeners();

    try {
      final items = await ScraperService.fetchHomepage(_currentSite, _currentPage);
      if (refresh) {
        _movies = items;
      } else {
        _movies.addAll(items);
      }
      _hasMorePages = items.isNotEmpty;
      _error = null;
    } catch (e) {
      _error = e.toString();
    }

    _isLoading = false;
    notifyListeners();
  }

  /// Load the next page (infinite scroll for homepage & search)
  Future<void> loadNextPage() async {
    if (_isLoadingMore || !_hasMorePages) return;

    _isLoadingMore = true;
    notifyListeners();

    try {
      if (_isSearchMode) {
        final nextPage = _searchCurrentPage + 1;
        final results = await SearchService.search(_currentSite, _searchQuery, page: nextPage);
        if (results.isEmpty) {
          _hasMorePages = false;
        } else {
          _searchResults.addAll(results);
          _searchCurrentPage = nextPage;
        }
      } else {
        final nextPage = _currentPage + 1;
        final items = await ScraperService.fetchHomepage(_currentSite, nextPage);
        if (items.isEmpty) {
          _hasMorePages = false;
        } else {
          _movies.addAll(items);
          _currentPage = nextPage;
        }
      }
    } catch (e) {
      // Silently fail on load more
    }

    _isLoadingMore = false;
    notifyListeners();
  }

  /// Search for movies/series
  Future<void> search(String query) async {
    if (query.trim().isEmpty) {
      exitSearch();
      return;
    }

    _searchQuery = query.trim();
    _isSearchMode = true;
    _isSearching = true;
    _searchCurrentPage = 1;
    _hasMorePages = true;
    _searchResults = [];
    _error = null;
    notifyListeners();

    try {
      final results = await SearchService.search(_currentSite, _searchQuery, page: 1);
      _searchResults = results;
      _hasMorePages = results.isNotEmpty;
      if (results.isEmpty) {
        _error = 'No results found for "$_searchQuery"';
      }
    } catch (e) {
      _error = 'Search failed: $e';
    }

    _isSearching = false;
    notifyListeners();
  }

  /// Exit search mode and return to homepage
  void exitSearch() {
    _isSearchMode = false;
    _searchQuery = '';
    _searchResults = [];
    _error = null;
    _hasMorePages = true;
    notifyListeners();
  }
}
