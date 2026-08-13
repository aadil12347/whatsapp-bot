import 'dart:async';
import 'package:flutter/foundation.dart';
import '../services/bot_service.dart';

class BotProvider with ChangeNotifier {
  String? _patKey;
  BotModel? _bot;
  bool _isLoading = false;
  bool _isActionLoading = false;
  String? _errorMessage;
  Timer? _timer;
  Duration _elapsed = Duration.zero;

  String? get patKey => _patKey;
  BotModel? get bot => _bot;
  bool get isLoading => _isLoading;
  bool get isActionLoading => _isActionLoading;
  String? get errorMessage => _errorMessage;
  Duration get elapsed => _elapsed;

  bool get hasValidBot => _bot != null;

  /// Start Button Status: Active ONLY if bot is stopped AND no action loading
  bool get isStartButtonActive => _bot != null && _bot!.isStopped && !_isActionLoading;

  /// Stop Button Status: Active ONLY if bot is started AND no action loading
  bool get isStopButtonActive => _bot != null && _bot!.isStarted && !_isActionLoading;

  BotProvider() {
    init();
  }

  Future<void> init() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _patKey = await BotService.getSavedPatKey();
      if (_patKey != null && _patKey!.isNotEmpty) {
        _bot = await BotService.fetchBotByPatKey(_patKey!);
        if (_bot == null) {
          _errorMessage = 'No bot found matching the saved PAT key.';
        } else {
          _startOrStopTimer();
        }
      }
    } catch (e) {
      _errorMessage = 'Failed to connect to Supabase: ${e.toString()}';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> loginWithPatKey(String patKey) async {
    final cleanKey = patKey.trim();
    if (cleanKey.isEmpty) {
      _errorMessage = 'Please enter a valid PAT key.';
      notifyListeners();
      return false;
    }

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final foundBot = await BotService.fetchBotByPatKey(cleanKey);
      if (foundBot == null) {
        _errorMessage = 'No GitHub Bot account matches this PAT key.';
        _isLoading = false;
        notifyListeners();
        return false;
      }

      await BotService.savePatKey(cleanKey);
      _patKey = cleanKey;
      _bot = foundBot;
      _startOrStopTimer();
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _errorMessage = 'Error validating key: ${e.toString()}';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> startBot() async {
    if (_bot == null || _patKey == null || !isStartButtonActive) return;

    _isActionLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      // 1. Immediately transition to 'starting'
      final updated = await BotService.updateBotStatus(
        botId: _bot!.id,
        patKey: _patKey!,
        newStatus: 'started',
      );
      _bot = updated;
      _startOrStopTimer();
    } catch (e) {
      _errorMessage = 'Failed to start bot: $e';
    } finally {
      _isActionLoading = false;
      notifyListeners();
    }
  }

  Future<void> stopBot() async {
    if (_bot == null || _patKey == null || !isStopButtonActive) return;

    _isActionLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final updated = await BotService.updateBotStatus(
        botId: _bot!.id,
        patKey: _patKey!,
        newStatus: 'stopped',
      );
      _bot = updated;
      _startOrStopTimer();
    } catch (e) {
      _errorMessage = 'Failed to stop bot: $e';
    } finally {
      _isActionLoading = false;
      notifyListeners();
    }
  }

  Future<void> refreshStatus() async {
    if (_patKey == null) return;
    try {
      final refreshed = await BotService.fetchBotByPatKey(_patKey!);
      if (refreshed != null) {
        _bot = refreshed;
        _startOrStopTimer();
        notifyListeners();
      }
    } catch (e) {
      print('Error refreshing bot status: $e');
    }
  }

  Future<void> logout() async {
    _timer?.cancel();
    await BotService.clearPatKey();
    _patKey = null;
    _bot = null;
    _elapsed = Duration.zero;
    _errorMessage = null;
    notifyListeners();
  }

  void _startOrStopTimer() {
    _timer?.cancel();
    if (_bot != null && _bot!.isStarted && _bot!.startedAt != null) {
      _updateElapsed();
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        _updateElapsed();
      });
    } else {
      _elapsed = Duration.zero;
      notifyListeners();
    }
  }

  void _updateElapsed() {
    if (_bot?.startedAt != null) {
      final now = DateTime.now();
      _elapsed = now.difference(_bot!.startedAt!);
      if (_elapsed.isNegative) _elapsed = Duration.zero;
      notifyListeners();
    }
  }

  String get formattedUptime {
    if (_bot == null || !_bot!.isStarted) return '00:00:00';
    final days = _elapsed.inDays;
    final hours = (_elapsed.inHours % 24).toString().padLeft(2, '0');
    final minutes = (_elapsed.inMinutes % 60).toString().padLeft(2, '0');
    final seconds = (_elapsed.inSeconds % 60).toString().padLeft(2, '0');

    if (days > 0) {
      return '$days d $hours h $minutes m $seconds s';
    }
    return '$hours:$minutes:$seconds';
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
