import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/bot_provider.dart';
import '../theme/app_theme.dart';

class BotControlScreen extends StatefulWidget {
  const BotControlScreen({super.key});

  @override
  State<BotControlScreen> createState() => _BotControlScreenState();
}

class _BotControlScreenState extends State<BotControlScreen> {
  final TextEditingController _patController = TextEditingController();

  @override
  void dispose() {
    _patController.dispose();
    super.dispose();
  }

  void _showTokenDialog(BuildContext context, BotProvider botProvider) {
    _patController.text = botProvider.patKey ?? '';

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: AppTheme.bgModal,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Row(
            children: [
              Icon(Icons.vpn_key_rounded, color: AppTheme.champagne),
              SizedBox(width: 10),
              Text(
                'GitHub PAT Key',
                style: TextStyle(color: AppTheme.champagne, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Enter your GitHub Personal Access Token to connect to your bot instance:',
                style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _patController,
                obscureText: true,
                style: const TextStyle(color: AppTheme.champagne),
                decoration: InputDecoration(
                  hintText: 'ghp_...',
                  hintStyle: TextStyle(color: AppTheme.textMuted.withOpacity(0.5)),
                  filled: true,
                  fillColor: AppTheme.bgSurface,
                  prefixIcon: const Icon(Icons.lock_outline, color: AppTheme.champagne),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: AppTheme.textMuted)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.emeraldInk,
                foregroundColor: AppTheme.champagne,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () async {
                final key = _patController.text;
                Navigator.pop(ctx);
                final success = await botProvider.loginWithPatKey(key);
                if (mounted && !success && botProvider.errorMessage != null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(botProvider.errorMessage!),
                      backgroundColor: Colors.redAccent,
                    ),
                  );
                }
              },
              child: const Text('Connect Bot'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<BotProvider>(
      builder: (context, provider, child) {
        return Scaffold(
          backgroundColor: AppTheme.bgDark,
          appBar: AppBar(
            backgroundColor: AppTheme.bgDark,
            elevation: 0,
            title: const Row(
              children: [
                Icon(Icons.smart_toy_outlined, color: AppTheme.champagne, size: 26),
                SizedBox(width: 10),
                Text('Bot Controller', style: TextStyle(fontWeight: FontWeight.bold)),
              ],
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh_rounded, color: AppTheme.champagne),
                tooltip: 'Refresh Status',
                onPressed: provider.isLoading ? null : () => provider.refreshStatus(),
              ),
              IconButton(
                icon: const Icon(Icons.key_rounded, color: AppTheme.champagne),
                tooltip: 'Change PAT Key',
                onPressed: () => _showTokenDialog(context, provider),
              ),
              if (provider.hasValidBot)
                IconButton(
                  icon: const Icon(Icons.logout_rounded, color: Colors.redAccent),
                  tooltip: 'Logout PAT Key',
                  onPressed: () => provider.logout(),
                ),
            ],
          ),
          body: SafeArea(
            child: provider.isLoading
                ? const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        CircularProgressIndicator(color: AppTheme.champagne),
                        SizedBox(height: 16),
                        Text('Fetching Bot Status...', style: TextStyle(color: AppTheme.textMuted)),
                      ],
                    ),
                  )
                : provider.bot == null
                    ? _buildKeySetupView(context, provider)
                    : _buildBotDashboard(context, provider),
          ),
        );
      },
    );
  }

  Widget _buildKeySetupView(BuildContext context, BotProvider provider) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: AppTheme.bgCard,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: AppTheme.divider),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: AppTheme.emeraldInk.withOpacity(0.2),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.phonelink_lock_rounded, size: 48, color: AppTheme.champagne),
              ),
              const SizedBox(height: 20),
              const Text(
                'Connect WhatsApp Bot',
                style: TextStyle(
                  color: AppTheme.champagne,
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Enter your GitHub Personal Access Token (PAT) key to automatically match your bot instance.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppTheme.textMuted, fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _patController,
                obscureText: true,
                style: const TextStyle(color: AppTheme.champagne),
                decoration: InputDecoration(
                  hintText: 'Paste GitHub PAT Key (ghp_...)',
                  hintStyle: TextStyle(color: AppTheme.textMuted.withOpacity(0.5)),
                  filled: true,
                  fillColor: AppTheme.bgSurface,
                  prefixIcon: const Icon(Icons.key_rounded, color: AppTheme.champagne),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
              if (provider.errorMessage != null) ...[
                const SizedBox(height: 12),
                Text(
                  provider.errorMessage!,
                  style: const TextStyle(color: Colors.redAccent, fontSize: 13),
                  textAlign: TextAlign.center,
                ),
              ],
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.emeraldInk,
                    foregroundColor: AppTheme.champagne,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  onPressed: () async {
                    await provider.loginWithPatKey(_patController.text);
                  },
                  child: const Text(
                    'Connect & Load Bot',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBotDashboard(BuildContext context, BotProvider provider) {
    final bot = provider.bot!;
    final isStarted = bot.isStarted;
    final isLoading = provider.isActionLoading || bot.isLoading;

    return RefreshIndicator(
      onRefresh: () => provider.refreshStatus(),
      color: AppTheme.champagne,
      backgroundColor: AppTheme.bgCard,
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        children: [
          // 1. VISIBLE USER / PHONE NUMBER CARD
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: AppTheme.cardGradient,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: AppTheme.divider),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.emeraldInk.withOpacity(0.3),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.phone_android_rounded, color: AppTheme.champagne, size: 28),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'ACTIVE WHATSAPP BOT',
                        style: TextStyle(
                          color: AppTheme.textMuted,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        bot.userNumber,
                        style: const TextStyle(
                          color: AppTheme.champagne,
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.edit_note_rounded, color: AppTheme.textMuted),
                  tooltip: 'Switch Account Token',
                  onPressed: () => _showTokenDialog(context, provider),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // 2. BOT STATUS BADGE & TIMER DISPLAY
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppTheme.bgCard,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: isStarted
                    ? const Color(0xFF10B981).withOpacity(0.3)
                    : Colors.redAccent.withOpacity(0.2),
              ),
              boxShadow: [
                if (isStarted)
                  BoxShadow(
                    color: const Color(0xFF10B981).withOpacity(0.05),
                    blurRadius: 20,
                    spreadRadius: 2,
                  ),
              ],
            ),
            child: Column(
              children: [
                // Status Pill
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: isLoading
                        ? Colors.amber.withOpacity(0.15)
                        : isStarted
                            ? const Color(0xFF064E3B)
                            : Colors.red.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(30),
                    border: Border.all(
                      color: isLoading
                          ? Colors.amber.withOpacity(0.5)
                          : isStarted
                              ? const Color(0xFF10B981).withOpacity(0.5)
                              : Colors.redAccent.withOpacity(0.5),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isLoading
                              ? Colors.amber
                              : isStarted
                                  ? const Color(0xFF10B981)
                                  : Colors.redAccent,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        isLoading
                            ? 'UPDATING...'
                            : isStarted
                                ? 'BOT RUNNING'
                                : 'BOT STOPPED',
                        style: TextStyle(
                          color: isLoading
                              ? Colors.amber
                              : isStarted
                                  ? AppTheme.champagne
                                  : Colors.redAccent,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                          letterSpacing: 1.0,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // Live Timer Display
                const Text(
                  'TOTAL RUNTIME DURATION',
                  style: TextStyle(
                    color: AppTheme.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.1,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  provider.formattedUptime,
                  style: TextStyle(
                    color: isStarted ? AppTheme.champagne : AppTheme.textMuted,
                    fontSize: 36,
                    fontWeight: FontWeight.w800,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          if (provider.errorMessage != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                provider.errorMessage!,
                style: const TextStyle(color: Colors.redAccent, fontSize: 13),
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 16),
          ],

          // 3. DYNAMIC CONTROLS (START & STOP BUTTONS)
          Row(
            children: [
              // START BUTTON
              Expanded(
                child: SizedBox(
                  height: 60,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: provider.isStartButtonActive
                          ? const Color(0xFF064E3B)
                          : AppTheme.bgSurface,
                      foregroundColor: provider.isStartButtonActive
                          ? AppTheme.champagne
                          : AppTheme.textMuted,
                      disabledBackgroundColor: AppTheme.bgSurface.withOpacity(0.5),
                      disabledForegroundColor: AppTheme.textMuted.withOpacity(0.3),
                      elevation: provider.isStartButtonActive ? 4 : 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                    ),
                    onPressed: provider.isStartButtonActive
                        ? () => provider.startBot()
                        : null,
                    child: isLoading && !isStarted
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.textMuted),
                          )
                        : const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.play_arrow_rounded, size: 24),
                              SizedBox(width: 6),
                              Text('START', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                            ],
                          ),
                  ),
                ),
              ),

              const SizedBox(width: 14),

              // STOP BUTTON
              Expanded(
                child: SizedBox(
                  height: 60,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: provider.isStopButtonActive
                          ? const Color(0xFF991B1B)
                          : AppTheme.bgSurface,
                      foregroundColor: provider.isStopButtonActive
                          ? AppTheme.champagne
                          : AppTheme.textMuted,
                      disabledBackgroundColor: AppTheme.bgSurface.withOpacity(0.5),
                      disabledForegroundColor: AppTheme.textMuted.withOpacity(0.3),
                      elevation: provider.isStopButtonActive ? 4 : 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                    ),
                    onPressed: provider.isStopButtonActive
                        ? () => provider.stopBot()
                        : null,
                    child: isLoading && isStarted
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.textMuted),
                          )
                        : const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.stop_rounded, size: 24),
                              SizedBox(width: 6),
                              Text('STOP', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                            ],
                          ),
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 30),

          // HOME WIDGET INFORMATIONAL CARD
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.bgSurface.withOpacity(0.5),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.divider),
            ),
            child: const Row(
              children: [
                Icon(Icons.widgets_outlined, color: AppTheme.champagne, size: 22),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Home Screen Widget Available',
                        style: TextStyle(color: AppTheme.champagne, fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'Add the DanieWatch Bot widget to your phone home screen for instant status updates & 1-tap start/stop controls.',
                        style: TextStyle(color: AppTheme.textMuted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
