# 已废弃：FastAPI + SQLite 后端

本目录为 **v1 架构**（FastAPI + SQLite + JWT）的代码，自 v2 起已不再使用。

v2 改为与 `qrcts` 一致的「纯静态前端（GitHub Pages）+ Supabase 外链数据库」架构，
后端逻辑下沉到 `supabase/init_database.sql` 的 **RPC 函数** 中，无需任何常驻容器。

保留此目录仅作历史参考。如需本地自托管旧版，可在此目录 `pip install -r requirements.txt` 后 `uvicorn app.main:app` 运行。
