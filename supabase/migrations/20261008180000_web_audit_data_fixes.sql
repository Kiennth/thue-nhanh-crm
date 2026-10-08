-- Ghi chép dữ liệu (theo audit Grok 08/10 tối, đã áp qua REST — chạy lại không cần thiết).
-- 1) Tag kích thước sai do máy tự gắn (27 sản phẩm): "00 inch" → "100 inch" (MH tương tác
--    100", máy chiếu Freestyle) / "55-100 inch" (giá đỡ E2500); bỏ "inch" đọc nhầm từ ren
--    3/8", jack 1/4", "2,4 inch" (micro Shure MV7X/MV7+, tay arm, K&F WM10, JBL Eon One,
--    Partybox On The Go, Zoom H6/H6e/H4e, Insta360 X2/X3, Mac Mini M4, loa tháp MX-T70,
--    GoPro 13, Osmo Action 4/5 Pro, Ace Pro 2); sửa Zoom H8 2.4", Tab S11 11", iPhone 14
--    6.1", Pixel 8 6.2", MH 22" và 34". Sao lưu scratchpad backup-inch-tags-2026-10-08.json.
-- 2) blog_posts: link http://thuenhanh.vn → đường dẫn tương đối, http://zalo.me → https.
select 1;
