//! 提醒辅助逻辑:免打扰时段判定(纯函数,可单测)。
//! 免打扰支持跨午夜:dnd_start=22:00, dnd_end=07:00 表示 22:00~次日 07:00 静默。

use chrono::{NaiveTime, Timelike};

/// 判断 now_ts 的 UTC 时分是否落在免打扰区间 [start, end)。
///
/// Business Logic（为什么需要这个函数）:
///     健康提醒 daemon（Task 6）在到达提醒触发点时，需要先判断当前是否处于
///     用户设定的免打扰时段（如夜间 22:00~07:00）。命中免打扰则不弹通知，
///     避免深夜打扰用户休息。
///
/// Code Logic（这个函数做什么）:
///     - 接收当前 Unix 时间戳 now_ts（秒）与免打扰起止 "HH:MM" 字符串。
///     - 任一参数为 None 或解析失败 → 返回 false（不免打扰）。
///     - 把 now_ts 取当天秒数（`rem_euclid(86400)`）再换算成分钟数 now_mins；
///       start/end 同样换算成分钟数。
///     - 普通区间（start_mins <= end_mins）: 命中条件 now_mins ∈ [start, end)，
///       start inclusive、end exclusive。
///     - 跨午夜区间（start_mins > end_mins，如 22:00~07:00）: 命中条件为
///       now_mins ∈ [start, 24:00) ∪ [00:00, end)。
///     - 注: 用 UTC 时分近似（单人单机可接受）；如需精确当地时区后续引入 chrono-tz。
pub fn is_in_dnd(now_ts: i64, dnd_start: Option<&str>, dnd_end: Option<&str>) -> bool {
    let (Some(s), Some(e)) = (dnd_start, dnd_end) else { return false; };
    let (Ok(start), Ok(end)) = (NaiveTime::parse_from_str(s, "%H:%M"), NaiveTime::parse_from_str(e, "%H:%M"))
        else { return false; };
    let secs_of_day = now_ts.rem_euclid(86400) as u32;
    let now_mins = secs_of_day / 60;
    let start_mins = start.hour() * 60 + start.minute();
    let end_mins = end.hour() * 60 + end.minute();
    if start_mins <= end_mins {
        now_mins >= start_mins && now_mins < end_mins
    } else {
        now_mins >= start_mins || now_mins < end_mins
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn no_dnd_when_missing_bounds() {
        assert!(!is_in_dnd(43200, None, None));           // 12:00 UTC,无 dnd
        assert!(!is_in_dnd(43200, Some("09:00"), None));  // 缺一端
    }
    #[test]
    fn normal_range_inclusive_start_exclusive_end() {
        assert!(is_in_dnd(43200, Some("09:00"), Some("17:00")));   // 12:00 in
        assert!(!is_in_dnd(28800, Some("09:00"), Some("17:00")));  // 08:00 out
        assert!(!is_in_dnd(61200, Some("09:00"), Some("17:00")));  // 17:00 out(不含)
    }
    #[test]
    fn overnight_range() {
        assert!(is_in_dnd(79200, Some("22:00"), Some("07:00")));   // 22:00 in
        assert!(is_in_dnd(10800, Some("22:00"), Some("07:00")));   // 03:00 in
        assert!(!is_in_dnd(36000, Some("22:00"), Some("07:00")));  // 10:00 out
    }
    #[test]
    fn invalid_format_is_not_dnd() {
        assert!(!is_in_dnd(43200, Some("bad"), Some("17:00")));
    }
}
