import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Luôn khởi tạo false (khớp với server, server không biết viewport thật)
  // rồi mới đọc window.innerWidth thật trong useEffect (chỉ chạy ở client,
  // sau khi hydrate xong) — đọc window ngay trong initializer của useState
  // gây lệch giữa HTML server render và lần render đầu ở client khi cửa sổ
  // hẹp hơn breakpoint, dẫn tới lỗi hydration mismatch trên toàn bộ sidebar.
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
