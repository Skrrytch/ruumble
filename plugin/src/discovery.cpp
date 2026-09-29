#include "discovery.h"

#include <algorithm>
#include <cctype>
#include <regex>
#include <sstream>

namespace ruumble {

namespace {

std::string lower(std::string s) {
	std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return static_cast< char >(std::tolower(c)); });
	return s;
}

/** HTML from Mumble to text lines: block ends and <br> become line breaks, other tags are dropped. */
std::string htmlToText(const std::string &html) {
	static const std::regex lineBreaks(R"(<\s*(br\s*/?|/\s*(p|div|li|h[1-6]|tr|pre))\s*>)", std::regex::icase);
	static const std::regex tags(R"(<[^>]*>)");
	std::string text = std::regex_replace(html, lineBreaks, "\n");
	text             = std::regex_replace(text, tags, "");
	const std::pair< const char *, const char * > entities[] = {
		{ "&nbsp;", " " }, { "&lt;", "<" }, { "&gt;", ">" }, { "&quot;", "\"" }, { "&#39;", "'" }, { "&amp;", "&" },
	};
	for (const auto &[from, to] : entities) {
		for (size_t pos = 0; (pos = text.find(from, pos)) != std::string::npos; pos += std::string(to).size())
			text.replace(pos, std::string(from).size(), to);
	}
	return text;
}

} // namespace

std::optional< std::string > findBridgeUrl(const std::string &description) {
	// "ruumble:" as a word of its own (not "xruumble:"), followed by exactly one address up to the end of the line
	static const std::regex line(R"((?:^|[^A-Za-z0-9_])ruumble:[ \t]*([^\s]+)[ \t]*$)", std::regex::icase);
	std::istringstream in(htmlToText(description));
	for (std::string l; std::getline(in, l);) {
		if (!l.empty() && l.back() == '\r') l.pop_back();
		std::smatch m;
		if (!std::regex_search(l, m, line)) continue;
		std::string url = m[1].str();
		const std::string l0 = lower(url);
		if (l0.rfind("http://", 0) != 0 && l0.rfind("https://", 0) != 0) {
			if (l0.find("://") != std::string::npos) continue; // do not allow other schemes (ws://, ftp://)
			url = "http://" + url;
		}
		while (!url.empty() && url.back() == '/') url.pop_back();
		if (url.find("://") + 3 >= url.size()) continue; // no host
		return url;
	}
	return std::nullopt;
}

} // namespace ruumble
