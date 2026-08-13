import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:home_widget/home_widget.dart';

class BotModel {
  final String id;
  final String userNumber;
  final String status; // 'started', 'stopped', 'starting', 'stopping'
  final DateTime? startedAt;
  final DateTime updatedAt;

  BotModel({
    required this.id,
    required this.userNumber,
    required this.status,
    this.startedAt,
    required this.updatedAt,
  });

  factory BotModel.fromMap(Map<String, dynamic> map) {
    return BotModel(
      id: map['id'] as String,
      userNumber: map['user_number'] as String? ?? 'Unknown Number',
      status: map['status'] as String? ?? 'stopped',
      startedAt: map['started_at'] != null ? DateTime.tryParse(map['started_at'].toString()) : null,
      updatedAt: map['updated_at'] != null ? DateTime.parse(map['updated_at'].toString()) : DateTime.now(),
    );
  }

  bool get isStarted => status == 'started';
  bool get isStopped => status == 'stopped';
  bool get isLoading => status == 'starting' || status == 'stopping';
}

class BotService {
  static const String _tokenPrefKey = 'user_github_pat_token';
  static SupabaseClient get _client => Supabase.instance.client;

  /// Save PAT key locally in SharedPreferences
  static Future<void> savePatKey(String patKey) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenPrefKey, patKey.trim());
  }

  /// Retrieve saved PAT key
  static Future<String?> getSavedPatKey() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenPrefKey);
  }

  /// Clear saved PAT key
  static Future<void> clearPatKey() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenPrefKey);
  }

  /// Fetch bot details by PAT Key from Supabase
  static Future<BotModel?> fetchBotByPatKey(String patKey) async {
    final cleanKey = patKey.trim();
    if (cleanKey.isEmpty) return null;

    try {
      final response = await _client
          .from('bot_instances')
          .select()
          .eq('github_token', cleanKey)
          .maybeSingle();

      if (response == null) return null;
      final bot = BotModel.fromMap(response);
      await updateWidgetData(bot);
      return bot;
    } catch (e) {
      print('Error fetching bot by PAT key: $e');
      rethrow;
    }
  }

  /// Update bot status in Supabase ('started' or 'stopped' or 'starting'/'stopping')
  static Future<BotModel?> updateBotStatus({
    required String botId,
    required String patKey,
    required String newStatus,
  }) async {
    try {
      final updateData = <String, dynamic>{
        'status': newStatus,
      };

      if (newStatus == 'started') {
        updateData['started_at'] = DateTime.now().toIso8601String();
      } else if (newStatus == 'stopped') {
        updateData['started_at'] = null;
      }

      final response = await _client
          .from('bot_instances')
          .update(updateData)
          .eq('id', botId)
          .select()
          .single();

      final bot = BotModel.fromMap(response);
      await updateWidgetData(bot);
      return bot;
    } catch (e) {
      print('Error updating bot status: $e');
      rethrow;
    }
  }

  /// Push updated state to Android Home Screen Widget
  static Future<void> updateWidgetData(BotModel bot) async {
    try {
      await HomeWidget.saveWidgetData<String>('bot_user_number', bot.userNumber);
      await HomeWidget.saveWidgetData<String>('bot_status', bot.status);
      await HomeWidget.saveWidgetData<String>(
        'bot_started_at',
        bot.startedAt?.toIso8601String() ?? '',
      );

      await HomeWidget.updateWidget(
        name: 'BotWidgetProvider',
        androidName: 'BotWidgetProvider',
      );
    } catch (e) {
      print('Widget sync exception: $e');
    }
  }
}
