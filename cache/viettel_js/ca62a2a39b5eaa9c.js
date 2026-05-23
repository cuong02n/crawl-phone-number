export function showToast(target = window.location.href) {
    // lấy route trang đăng nhập
    const LOGIN_ROUTE = Laravel.routes['auth.login'];

    // lưu trang đích đến sau khi đăng nhập thành công
    localStorage.setItem('redirectLogin', target);

    // get dom modal toast
    var modalToastLoading = $('#toast-login-wrap');

    // hiển thị toast nếu có dom
    if (modalToastLoading) {
        modalToastLoading.show();
        setTimeout(() => {
            // nếu đây là trang đăng nhập thì chỉ tắt modal đi
            if (window.location.pathname.includes('/' + LOGIN_ROUTE)) {
                // tắt modal
                modalToastLoading.hide();

                // focus vào các field đăng nhập
                var listInput = $('#tab-mobile input')
                if (listInput.length == 2 && listInput.index($('[type="password"]')) > -1) {
                    listInput.each(function() {
                        if ($(this).val() == '') {
                            $(this).focus();
                            return false;
                        }
                    });
                }
            } else {
                // nếu là trang khác thì redirect sang trang đăng nhập
                window.location.href = window.location.origin + '/' + LOGIN_ROUTE;
            }
        }, 2000); // timeout 2s để user đọc nội dung toast
    }
}

// lấy danh sách các thẻ a có đường dẫn tới trang cần đăng nhập. Các thẻ a này đc thẻ hiện bằng việc tồn tại attribute b-toast-login
var btnToastLogin = $('[b-toast-login]');

// nếu có danh sách thẻ này thì tạo sự kiện show modal toast login cho mỗi sự kiện click vào thẻ đó, đồng thời tắt sự kiện redirect bằng click href
if (btnToastLogin.length) {
    btnToastLogin.each(function() {
        $(this).click(function() {
            showToast($(this).attr('href'));
            return false;
        })
    });
}