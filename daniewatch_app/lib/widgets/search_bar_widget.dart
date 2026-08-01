import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Search Bar styled strictly with Emerald Ink & Champagne.
class SearchBarWidget extends StatefulWidget {
  final Function(String) onSearch;
  final VoidCallback onClear;
  final bool isSearchMode;
  final String currentQuery;

  const SearchBarWidget({
    super.key,
    required this.onSearch,
    required this.onClear,
    required this.isSearchMode,
    required this.currentQuery,
  });

  @override
  State<SearchBarWidget> createState() => _SearchBarWidgetState();
}

class _SearchBarWidgetState extends State<SearchBarWidget> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  bool _isFocused = false;

  @override
  void initState() {
    super.initState();
    _controller.text = widget.currentQuery;
    _focusNode.addListener(() {
      setState(() {
        _isFocused = _focusNode.hasFocus;
      });
    });
  }

  @override
  void didUpdateWidget(SearchBarWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.isSearchMode && oldWidget.isSearchMode) {
      _controller.clear();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _submit() {
    final q = _controller.text.trim();
    if (q.isNotEmpty) {
      _focusNode.unfocus();
      widget.onSearch(q);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      decoration: BoxDecoration(
        color: AppTheme.bgSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: _isFocused
              ? AppTheme.champagne
              : AppTheme.emeraldInk.withOpacity(0.5),
          width: _isFocused ? 1.8 : 1.0,
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.offBlack.withOpacity(0.3),
            blurRadius: _isFocused ? 12 : 6,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Row(
        children: [
          const SizedBox(width: 14),
          AnimatedScale(
            scale: _isFocused ? 1.1 : 1.0,
            duration: const Duration(milliseconds: 180),
            child: Icon(
              Icons.search_rounded,
              color: _isFocused ? AppTheme.champagne : AppTheme.textMuted,
              size: 22,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: _controller,
              focusNode: _focusNode,
              style: const TextStyle(
                color: AppTheme.champagne,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
              decoration: const InputDecoration(
                hintText: 'Search movies & series...',
                hintStyle: TextStyle(color: AppTheme.textMuted, fontSize: 14),
                border: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.symmetric(vertical: 14),
              ),
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _submit(),
            ),
          ),
          if (widget.isSearchMode || _controller.text.isNotEmpty)
            GestureDetector(
              onTap: () {
                _controller.clear();
                widget.onClear();
              },
              child: const Padding(
                padding: EdgeInsets.all(12),
                child: Icon(Icons.close_rounded,
                    color: AppTheme.textMuted, size: 20),
              ),
            )
          else
            GestureDetector(
              onTap: _submit,
              child: Container(
                margin: const EdgeInsets.only(right: 6),
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: AppTheme.emeraldInk,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.champagne.withOpacity(0.3)),
                ),
                child: const Icon(Icons.search_rounded,
                    color: AppTheme.champagne, size: 20),
              ),
            ),
        ],
      ),
    );
  }
}
