export type PrintDocType = "contract" | "quote" | "handover" | "collection" | "acceptance";

export const PRINT_DOC_TITLES: Record<PrintDocType, string> = {
  contract: "HỢP ĐỒNG CHO THUÊ",
  quote: "BÁO GIÁ",
  handover: "BIÊN BẢN BÀN GIAO",
  collection: "BIÊN BẢN THU HỒI",
  acceptance: "BIÊN BẢN NGHIỆM THU",
};

export const PRINT_DOC_MENU_LABELS: Record<PrintDocType, string> = {
  contract: "Tạo hợp đồng",
  quote: "Tạo báo giá",
  handover: "Tạo biên bản bàn giao",
  collection: "Tạo biên bản thu hồi",
  acceptance: "Tạo biên bản nghiệm thu",
};

export interface TermsSection {
  heading: string;
  items: string[];
}

// contract: chép nguyên văn từ điều khoản hợp đồng thật công ty đang dùng
// (Booqable > Settings > Documents > Contracts > Contract body, lấy ngày
// 2026-07-28) — không tự bịa nội dung pháp lý. quote/handover vẫn là bản
// nháp ngắn gọn, CẦN người có thẩm quyền rà lại trước khi dùng chính thức.
// Sửa trực tiếp tại đây (chưa có màn hình cài đặt riêng cho bản V1 này).
export const PRINT_DOC_TERMS: Record<PrintDocType, TermsSection[]> = {
  contract: [
    {
      heading: "Điều khoản thanh toán",
      items: [
        "Thanh toán đợt 1: Bên thuê chuyển khoản 100% tiền thuê thiết bị sau khi nhận báo giá để Bên cho thuê có căn cứ thực hiện.",
        "Thanh toán đợt 2: Bên thuê chuyển khoản 100% tiền ký quỹ trong vòng 24 giờ trước khi nhận để Bên cho thuê làm thủ tục xuất kho, đóng gói thiết bị, vận chuyển tới địa điểm do Bên thuê yêu cầu.",
        "Hoàn tiền: Bên cho thuê chuyển khoản hoàn tiền ký quỹ (đã trừ chi phí phát sinh nếu có) trong vòng 24 giờ sau khi nhận lại thiết bị thuê và hai bên đồng ý Biên bản nghiệm thu.",
        "Hoá đơn GTGT phát hành trong vòng 24 giờ sau khi kết thúc dịch vụ.",
      ],
    },
    {
      heading: "Trách nhiệm của Bên cho thuê",
      items: [
        "Bên cho thuê cam kết cung cấp cho Bên thuê đầy đủ các thiết bị như đã nêu tại Điều 1 hoặc Phụ lục đính kèm của Hợp đồng này, đồng thời cam kết thực hiện đầy đủ các nghĩa vụ và trách nhiệm được nêu.",
        "Bên cho thuê không được đơn phương thay đổi hay chấm dứt Hợp đồng sau khi đã ký kết. Trường hợp Bên cho thuê đơn phương thay đổi hay chấm dứt Hợp đồng khi chưa được Bên thuê chấp thuận thì Bên cho thuê phải hoàn trả toàn bộ số tiền mà Bên thuê đã tạm ứng cho hợp đồng và phải chịu phạt 30% (ba mươi phần trăm) tổng giá trị Hợp đồng.",
        "Trong trường hợp Bên cho thuê cung cấp thiết bị trễ so với thời gian giao ước đã được thỏa thuận tại Điều 1 hoặc Phụ lục đính kèm mà không thông báo trước bằng văn bản cho Bên thuê và không được sự đồng ý của Bên thuê thì Bên cho thuê phải trả phí phạt đến 3% trị giá tổng giá trị hợp đồng. Bên cho thuê được miễn trừ trách nhiệm về bất cứ một sự chậm trễ nào trong việc giao thiết bị nếu sự chậm trễ đó là do những nguyên nhân từ sự thay đổi của Bên thuê mà không thông báo bằng văn bản cho Bên cho thuê trước 24 (hai mươi tư) giờ.",
        "Bên cho thuê được miễn trừ trách nhiệm về bất cứ một sự chậm trễ nào trong việc bàn giao thiết bị nếu sự chậm trễ đó là do Bên cho thuê chưa nhận được tiền thanh toán hoặc tạm ứng của Bên thuê vào tài khoản như đã thoả thuận.",
        "Bên cho thuê có trách nhiệm kiểm tra thiết bị đầy đủ phụ kiện và hoạt động tốt khi giao hàng. (Thiết bị cần được vệ sinh sạch sẽ, đảm bảo tình trạng 80 – 90%).",
        "Thiết bị cho thuê phải đảm bảo nguồn gốc hợp pháp.",
        "Bên cho thuê cam kết hỗ trợ thay thế nếu thiết bị thuê trục trặc trong vòng 24 (hai mươi tư) giờ kể từ khi nhận được thông báo để thời gian sử dụng thiết bị không bị gián đoạn.",
        "Bên cho thuê có trách nhiệm xuất hoá đơn GTGT ngay sau khi nhận được thanh toán đầy đủ từ Bên thuê.",
        "Bên cho thuê được quyền đơn phương chấm dứt hợp đồng với Bên thuê, và thu hồi thiết bị thuê nếu Bên thuê không thực hiện đầy đủ nghĩa vụ thanh toán đối với Bên thuê như Điều 3 của Hợp Đồng này.",
        "Bên cho thuê có trách nhiệm chuyển khoản hoàn tiền ký quỹ (đã trừ chi phí phát sinh nếu có) sau khi hai bên ký Biên bản nghiệm thu thanh lý.",
      ],
    },
    {
      heading: "Trách nhiệm của Bên thuê",
      items: [
        "Bên thuê có trách nhiệm cử người đại diện kiểm tra thiết bị đầy đủ phụ kiện và hoạt động tốt khi nhận bàn giao từ đại diện của Bên cho thuê.",
        "Bên thuê có trách nhiệm cử người đại diện nhận bàn giao theo thời gian đã thoả thuận trong Phụ lục hợp đồng, nếu có thay đổi thời gian nhận bàn giao thì Bên thuê phải thông báo trước với Bên cho thuê bằng thư điện tử hoặc văn bản để Bên thuê chủ động điều phối Bên vận chuyển giao hàng. Nếu Bên thuê không thông báo trước bằng văn bản trước ít nhất 24 (hai mươi tư) giờ thì toàn bộ phí trả trễ thiết bị, phí vận chuyển phát sinh và chi phí lương làm thêm giờ cho người lao động phát sinh khi nhận bàn giao trễ do Bên thuê chi trả cho Bên vận chuyển và người lao động.",
        "Bên thuê có nghĩa vụ thanh toán đúng theo Điều 3 của hợp đồng. Trường hợp Bên thuê thanh toán trễ hơn so với thời gian giao ước đã được thỏa thuận tại Điều 3 thì Bên thuê phải trả phí phạt trả chậm là 1% tổng giá trị hợp đồng và lãi suất 0,06%/ngày trên số tiền chậm trả.",
        "Bên thuê không được tự ý tháo, mở, sửa chữa, thay thế phụ kiện của máy móc thiết bị của Bên cho thuê. Trong trường hợp Bên thuê tự ý tháo mở sửa chữa, thay thế, Bên cho thuê có quyền từ chối nhận lại sản phẩm và Bên thuê phải bồi thường theo giá trị của máy móc thiết bị do Bên cho thuê yêu cầu.",
        "Nếu xảy ra hư hại một phần xuất phát từ Bên thuê trong thời gian thuê, Bên thuê phải có trách nhiệm sửa chữa hoặc chi trả toàn bộ chi phí sửa chữa tại trung tâm do Bên cho thuê yêu cầu.",
        "Nếu xảy ra trầy xước, móp, méo, đứt, vỡ xuất phát từ Bên thuê trong thời gian thuê, Bên thuê phải có trách nhiệm bồi thường cho Bên cho thuê theo giá trị của máy móc thiết bị do Bên cho thuê yêu cầu dựa trên định giá thị trường.",
        "Nếu xảy ra hư hại toàn phần xuất phát từ Bên thuê trong thời gian thuê, Bên thuê phải có trách nhiệm bồi thường cho Bên cho thuê theo giá trị của máy móc thiết bị do Bên cho thuê yêu cầu dựa trên định giá thị trường.",
        "Bên thuê có trách nhiệm bảo quản thiết bị, đầy đủ phụ kiện và sử dụng cẩn thận khi nhận bàn giao. Bên cho thuê không chịu trách nhiệm về mất mát, thiếu sót phụ kiện hoặc sản phẩm không hoạt động sau khi Bên thuê nhận bàn giao và sử dụng.",
        "Bên thuê cam kết hoàn trả đầy đủ phụ kiện, dây cáp, sạc, bao đựng, ốp bảo vệ, túi bảo vệ và đồng thời đăng xuất mọi tài khoản, email, iCloud khỏi thiết bị trước khi trả hàng để Bên cho thuê nghiệm thu thiết bị.",
        "Nếu không làm đúng cam kết Bên thuê chịu mọi chi phí phát sinh đảm bảo cho việc hoàn trả thiết bị cho Bên cho thuê.",
      ],
    },
    {
      heading: "Tranh chấp và xử lý tranh chấp",
      items: [
        "Trong trường hợp xảy ra tranh chấp, Hai Bên cố gắng gặp gỡ hòa giải trên tinh thần thiện chí và hợp tác. Nếu vẫn không thống nhất cách giải quyết thì Hai Bên có quyền sẽ khởi kiện tại Tòa án có thẩm quyền tại TP.HCM xem xét giải quyết. Toàn bộ chi phí liên quan do Bên thua kiện chịu.",
        "Trong thời gian Tòa án thụ lý và chưa đưa ra phán quyết, các Bên vẫn phải tiếp tục thi hành nghĩa vụ và trách nhiệm của mình theo quy định của Hợp Đồng này.",
      ],
    },
    {
      heading: "Các trường hợp bất khả kháng",
      items: [
        "Không Bên nào phải chịu trách nhiệm về việc chậm trễ hoặc không thể hoàn thành các nghĩa vụ được quy định trong Hợp đồng này nếu nguyên nhân gây ra sự chậm trễ hoặc không thực hiện đó là các tình huống bất khả kháng như đình công, hỏa hoạn, lũ lụt, thiên tai, động đất, dịch bệnh theo văn bản thông báo của cơ quan Nhà nước có thẩm quyền hoặc bất cứ các quy định, điều luật của cơ quan nhà nước có thẩm quyền hoặc các tình huống khác nằm ngoài khả năng kiểm soát của bên tham gia Hợp đồng mà không thể dự báo trước.",
        "Bên gặp Sự kiện bất khả kháng như quy định ở khoản 1 điều này cần thông báo cho Bên còn lại bằng văn bản trong vòng 03 ngày kể từ ngày xảy ra Sự kiện bất khả kháng để thông báo về (i) Sự kiện bất khả kháng và các biện pháp được áp dụng để giảm thiểu hậu quả của sự kiện bất khả kháng, và/hoặc (ii) việc một Bên không thể thực hiện được nghĩa vụ theo Hợp đồng hoặc kéo dài thời gian thực hiện Hợp đồng tương ứng. Việc một Bên không hoàn thành hoặc hoàn thành không đầy đủ nghĩa vụ theo Hợp đồng do Sự kiện bất khả kháng sau khi thực hiện nghĩa vụ khắc phục hậu quả và thông báo được miễn trách nhiệm do hành vi vi phạm Hợp đồng của mình phát sinh từ Sự kiện bất khả kháng. Nếu có đề nghị bất thường, hai bên sẽ thỏa thuận thông qua đàm phán.",
        "Trong trường hợp xảy ra sự kiện bất khả kháng, thời gian thực hiện Hợp đồng sẽ được kéo dài bằng thời gian diễn ra sự kiện bất khả kháng mà Bên bị ảnh hưởng không thể thực hiện các nghĩa vụ theo Hợp Đồng mà Hai Bên đã ký.",
      ],
    },
    {
      heading: "Điều khoản chung",
      items: [
        "Trường hợp Bên thuê đơn phương chấm dứt hợp đồng đã ký sẽ chịu phạt 30% giá trị hợp đồng. Bên cho thuê không phải chuyển lại số tiền đã nhận tạm ứng từ Bên thuê.",
        "Các bên không được chuyển nhượng Hợp đồng này dưới bất kỳ hình thức nào.",
        "Hợp đồng này có hiệu lực từ ngày ký và được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị pháp lý như nhau. Hợp đồng sẽ tự thanh lý ngay khi kết thúc thời gian thuê máy và thiết bị nếu không có phát sinh thêm.",
      ],
    },
  ],
  quote: [
    {
      heading: "Điều khoản",
      items: [
        "Báo giá trên chưa bao gồm các chi phí phát sinh ngoài phạm vi (nếu có) và có thể thay đổi tuỳ thời điểm chốt đơn.",
        "Báo giá có hiệu lực trong vòng 03 ngày kể từ ngày phát hành, trừ khi có thoả thuận khác.",
        "Đơn hàng được xác nhận sau khi khách hàng phản hồi chốt đơn và/hoặc thanh toán cọc giữ chỗ.",
      ],
    },
  ],
  handover: [
    {
      heading: "Điều khoản",
      items: [
        "Hai bên xác nhận đã kiểm tra số lượng, tình trạng thiết bị tại thời điểm giao hàng như liệt kê trên — thiết bị hoạt động tốt, đầy đủ phụ kiện đi kèm.",
        "Bên thuê có trách nhiệm bảo quản thiết bị kể từ thời điểm ký biên bản này cho đến khi hoàn trả.",
        "Mọi khác biệt so với danh sách trên (nếu có) đã được ghi chú rõ tại mục ghi chú kèm theo.",
      ],
    },
  ],
  collection: [
    {
      heading: "Điều khoản",
      items: [
        "Hai bên xác nhận đã kiểm tra số lượng, tình trạng thiết bị tại thời điểm thu hồi như liệt kê trên.",
        "Mọi hư hỏng, thiếu phụ kiện, mất mát (nếu có) đã được ghi nhận cụ thể tại mục ghi chú kèm theo để làm căn cứ xử lý bồi thường (nếu có).",
        "Biên bản này là căn cứ để lập Biên bản nghiệm thu và xử lý tiền ký quỹ.",
      ],
    },
  ],
  acceptance: [
    {
      heading: "Điều khoản",
      items: [
        "Hai bên xác nhận đã đối chiếu thiết bị thu hồi với Biên bản bàn giao ban đầu — thiết bị đầy đủ, hoạt động bình thường, không phát sinh hư hỏng ngoài hao mòn tự nhiên.",
        "Trường hợp có hư hỏng/thiếu hụt, hai bên đã thống nhất mức bồi thường và ghi rõ tại mục ghi chú kèm theo.",
        "Biên bản này là căn cứ để Bên cho thuê hoàn trả tiền ký quỹ (đã trừ chi phí phát sinh nếu có) và thanh lý hợp đồng thuê.",
      ],
    },
  ],
};
