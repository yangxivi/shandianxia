import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { HashRouter } from "react-router-dom";
import App from "./App";

// 基于 zh_CN 覆盖月份为数字格式（1-12），用 as any 绕过严格类型检查
const numericMonthLocale = {
  ...zhCN,
  DatePicker: {
    ...zhCN.DatePicker,
    lang: {
      ...zhCN.DatePicker!.lang,
      shortMonths: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
      months: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
      locale: "zh_CN",
    },
    format: "YYYY-MM",
  },
} as typeof zhCN;

// 注意：不使用 React.StrictMode，因为它会导致 useEffect 双重执行，
// 第一次执行的 API 请求会被浏览器取消，从而抛出 "Failed to fetch" 错误。
// 这在开发模式下是可重现的问题，影响正常使用。
ReactDOM.createRoot(document.getElementById("root")!).render(
  <ConfigProvider locale={numericMonthLocale} theme={{ token: { colorPrimary: "#1677ff" } }}>
    <AntApp>
      <HashRouter>
        <App />
      </HashRouter>
    </AntApp>
  </ConfigProvider>
);
