jQuery(document).ready(function($) {
    // $('.banner-slideshow').owlCarousel({
    // 	autoplay: true,
    // 	autoplayTimeout: 3000,
    // 	autoplayHoverPause: true,
    // 	loop: true,
    // 	nav: true,
    // 	items: 1,
    // 	navText: ["<i class='icon-i-prev'></i>", "<i class='icon-i-next'></i>"],
    // 	lazyLoad: true,
    // 	lazyLoadEager: 1
    // });

    // $('.slider .owl-carousel.col3').owlCarousel({
    // 	autoplay: false,
    // 	autoplayTimeout: 3000,
    // 	autoplayHoverPause: true,
    // 	loop: true,
    // 	nav: true,
    // 	navText: ["<i class='icon-i-prev'></i>", "<i class='icon-i-next'></i>"],
    // 	items: 3,
    // 	responsive: {
    // 		0: {
    // 			items: 1,
    // 			dots: false
    // 		},
    // 		768: {
    // 			items: 2,
    // 			dots: true
    // 		},
    // 		1024: {
    // 			items: 3
    // 		}
    // 	},
    // 	lazyLoad: true
    // });

    // $('.slider .owl-carousel.col2').owlCarousel({
    // 	autoplay: false,
    // 	autoplayTimeout: 3000,
    // 	autoplayHoverPause: true,
    // 	loop: true,
    // 	nav: true,
    // 	navText: ["<i class='icon-i-prev'></i>", "<i class='icon-i-next'></i>"],
    // 	items: 2,
    // 	responsive: {
    // 		0: {
    // 			items: 1,
    // 			dots: false
    // 		},
    // 		768: {
    // 			items: 2,
    // 			dots: true
    // 		}
    // 	},
    // 	lazyLoad: true
    // });

    // $('.slider .owl-carousel.col4').owlCarousel({
    // 	autoplay: false,
    // 	autoplayTimeout: 3000,
    // 	autoplayHoverPause: true,
    // 	loop: true,
    // 	nav: true,
    // 	navText: ["<i class='icon-i-prev'></i>", "<i class='icon-i-next'></i>"],
    // 	items: 4,
    // 	responsive: {
    // 		0: {
    // 			items: 1,
    // 			dots: false
    // 		},
    // 		480: {
    // 			items: 2
    // 		},
    // 		768: {
    // 			items: 3
    // 		},
    // 		1024: {
    // 			items: 4
    // 		}
    // 	},
    // 	lazyLoad: true
    // });

    // $('.slider .owl-carousel.col1').owlCarousel({
    // 	autoplay: false,
    // 	autoplayTimeout: 3000,
    // 	autoplayHoverPause: true,
    // 	loop: true,
    // 	dots: false,
    // 	nav: true,
    // 	navText: ["<i class='icon-i-prev'></i>", "<i class='icon-i-next'></i>"],
    // 	items: 1,
    // 	responsive: {
    // 		0: {
    // 			items: 1
    // 		},
    // 		768: {
    // 			items: 1
    // 		},
    // 		1024: {
    // 			items: 1
    // 		}
    // 	},
    // 	lazyLoad: true
    // });

    // $('.dv-internet .dv-internet-gtgt').owlCarousel({
    // 	autoWidth:true,
    // 	dots: true,
    // 	loop: true,
    // 	navRewind: true,
    // 	autoplay: false,
    // 	responsive: {
    //         0: {
    //             margin: 15,
    //         },
    //         479: {
    //             margin: 20,
    //         },
    //         768: {
    //
    //             autoplayTimeout: 3000,
    //             autoplayHoverPause: true,
    //             margin: 36
    //         }
    //     },
    //     lazyLoad: true
    // });

    //*****Gia tri gia tang */
    // if ($('.slide-slick').length > 0) {
    // 	$('.slide-slick').each(function(){
    // 		var slide_row_desktop = $(this).data('item-desktop');
    // 		var slide_row_tab = $(this).data('item-tab');
    // 		var slide_row_mobile = $(this).data('item-mobile');
    // 		var rows_desktop = 1;
    // 		var rows_tab = 1;
    // 		var rows_mobile = 1;
    // 		if($(this).data('rows-desktop') > 1)
    // 			rows_desktop = $(this).data('rows-desktop');
    // 		if($(this).data('rows-tab') > 1)
    // 			rows_tab = $(this).data('rows-tab');
    // 		if($(this).data('rows-mobile') > 1)
    // 			rows_mobile = $(this).data('rows-mobile');
    // 		if (rows_desktop > 1) {
    // 			$(this).slick({
    // 				rows: rows_desktop,
    // 				slidesPerRow: slide_row_desktop,
    // 				dots: true,
    // 				dotsClass: 'owl-dots',
    // 				arrows: true,
    // 				adaptiveHeight: true,
    // 		  		prevArrow: '<button type="button" data-role="none" class="slick-prev"><i class="icon-i-prev"></button>',
    // 			    nextArrow: '<button type="button" data-role="none" class="slick-next"><i class="icon-i-next"></button>',
    // 				responsive: [{
    // 					breakpoint: 1024,
    // 						settings: {
    // 							slidesPerRow: slide_row_desktop,
    // 							rows: rows_desktop
    // 						}
    // 					}, {
    // 					breakpoint: 768,
    // 						settings: {
    // 							slidesPerRow: slide_row_tab,
    // 							rows: rows_tab
    // 						}
    // 					}, {
    // 					breakpoint: 480,
    // 						settings: {
    // 							slidesPerRow: slide_row_mobile,
    // 							rows: rows_mobile
    // 						}
    // 				}]
    // 			});
    // 		}
    // 	});
    // }

    function slide_haft() {
        $('.dv-internet .owl-carousel .item').width($('.dv-internet .tabs').width() / 1.45);
        if ($(window).width() > 480)
            $('.dv-internet .owl-carousel .item').width($('.dv-internet .tabs').width() / 2.515);
    }
    slide_haft();
    $(window).resize(function() {
        slide_haft();
    });

    // $('.dv-internet .owl-carousel').owlCarousel({
    //     autoWidth: true,
    //     dots: true,
    //     loop: true,
    //     navRewind: true,
    //     autoplay: true,
    //     nav: true,
    //     navText: ["<i class='icon-i-prev'></i>", "<i class='icon-i-next'></i>"],
    //     responsive: {
    //         0: {
    //             margin: 15,
    //         },
    //         479: {
    //             margin: 20,
    //         },
    //         768: {
    //             autoplayTimeout: 3000,
    //             autoplayHoverPause: true,
    //             margin: 36
    //         }
    //     },
    //     lazyLoad: true
    // });

    // $('.ud-viettel .owl-carousel').owlCarousel({
    //     autoWidth: true,
    //     loop: true,
    //     navRewind: true,
    //     nav: true,
    //     navText: ["<i class='icon-i-prev'></i>", "<i class='icon-i-next'></i>"],
    //     responsive: {
    //         0: {
    //             items: 1,
    //             dots: false,
    //             autoWidth: false
    //         },
    //         768: {
    //             autoplayTimeout: 3000,
    //             autoplayHoverPause: true,
    //             dots: true
    //         }
    //     },
    //     lazyLoad: true
    // });

    // $('.slider .owl-carousel.col5').owlCarousel({
    //     autoplay: false,
    //     loop: true,
    //     nav: true,
    //     navText: ["<i class='icon-i-prev'></i>", "<i class='icon-i-next'></i>"],
    //     items: 5,
    //     responsive: {
    //         0: {
    //             items: 1,
    //             dots: false
    //         },
    //         768: {
    //             items: 3,
    //             dots: true
    //         },
    //         1024: {
    //             items: 5
    //         }
    //     },
    //     lazyLoad: true
    // });

    // Chart ============

    // function dataDonutChart(arr) {
    //     for (var id of arr) {
    //         var percentData1 = $('#' + id).data('percent1');
    //         var percentData2 = $('#' + id).data('percent2');
    //         var color1 = $('#' + id).data('color1') ? $('#' + id).data('color1') : '#D8D8D8';
    //         var color2 = $('#' + id).data('color2') ? $('#' + id).data('color2') : '#EE0033';
    //         if (percentData1 && percentData2) {
    //             Highcharts.chart(id, {
    //                 chart: {
    //                     height: 276,
    //                     plotBackgroundColor: null,
    //                     plotBorderWidth: 0,
    //                     plotShadow: false
    //                 },
    //                 title: {
    //                     text: "",
    //                     align: 'center',
    //                     verticalAlign: 'middle',
    //                     y: 60
    //                 },
    //                 tooltip: {
    //                     enabled: false,
    //                     pointFormat: '{series.name} <b>{point.percentage:.1f}%</b>'
    //                 },
    //                 credits: {
    //                     enabled: false
    //                 },
    //                 plotOptions: {
    //                     pie: {
    //                         dataLabels: {
    //                             enabled: false,
    //                             distance: -50,
    //                             style: {
    //                                 fontWeight: 'bold',
    //                                 color: 'white'
    //                             }
    //                         },
    //                         startAngle: -90,
    //                         endAngle: 90,
    //                         center: ['50%', '75%'],
    //                         size: '100%'
    //                     },
    //                     series: {
    //                         states: {
    //                             hover: {
    //                                 enabled: false
    //                             },
    //                             inactive: {
    //                                 opacity: .85,
    //                             },
    //                         }
    //                     }
    //                 },
    //                 series: [{
    //
    //                     type: 'pie',
    //                     name: '',
    //                     innerSize: '90%',
    //                     data: [
    //                         ['Lưu lượng đã sử dụng ', percentData1],
    //                         ['Lưu lượng còn lại', percentData2],
    //
    //                     ],
    //
    //                 }],
    //                 colors: [color1, color2]
    //             });
    //         }
    //
    //     }
    //
    // }
    //
    // function createDonutCarousel() {
    //     $('.radius-top .owl-carousel').owlCarousel({
    //         center: true,
    //         loop: true,
    //         nav: true,
    //         items: 1,
    //         navText: ["<i class='icon-i-prev'></i>", "<i class='icon-i-next'></i>"],
    //         lazyLoad: true,
    //         responsive: {
    //             0: {
    //                 margin: 15,
    //                 dots: false
    //             },
    //             479: {
    //                 margin: 20
    //             },
    //             768: {
    //                 dots: true,
    //             },
    //             1024: {
    //                 margin: 80
    //             }
    //         },
    //         onInitialize: setTimeout(cloneChart, 1000),
    //     });
    // }
    //
    // function cloneChart() {
    //
    //     var htmlString3 = $(".owl-item:not(.cloned) .item3").html();
    //     $(".owl-item.cloned .item3").html(htmlString3);
    //     var htmlString = $(".owl-item:not(.cloned) .item1").html();
    //     $(".owl-item.cloned .item1").html(htmlString);
    //     var htmlString2 = $(".owl-item:not(.cloned) .item2").html();
    //     $(".owl-item.cloned .item2").html(htmlString2);
    //
    // }
    // dataDonutChart(['data-donut1', 'data-donut2', 'data-donut3', 'date-donut1', 'date-donut2', 'date-donut3']);
    // createDonutCarousel();

    // End Chart ===============

    // $('.tabs-pack-data .owl-carousel').owlCarousel({
    //     center: true,
    //     loop: true,
    //     nav: true,
    //     items: 1,
    //     navText: ["<i class='icon-i-prev'></i>", "<i class='icon-i-next'></i>"],
    //     lazyLoad: true,
    //     responsive: {
    //         0: {
    //             margin: 15,
    //             dots: false
    //         },
    //         479: {
    //             margin: 20
    //         },
    //         768: {
    //             dots: true,
    //         },
    //         1024: {
    //             margin: 80
    //         }
    //     },
    //     lazyLoadEager: 1
    // });

    // $('.tab-title a').on('click', function(e) {
    //     $(this).parents('.tabs').find('.tab-title li').removeClass('active');
    //     $(this).parent().addClass('active');
    //     $(this).parents('.tabs').find('.tabcontent').removeClass('active');
    //     $($(this).attr('href')).addClass('active');
    //     e.preventDefault();
    // });

    // if ($('.slide-slick').length > 0) {
    // 	$('.slide-slick').each(function () {
    // 		var slide_row_desktop = $(this).data('item-desktop');
    // 		var slide_row_tab = $(this).data('item-tab');
    // 		var slide_row_mobile = $(this).data('item-mobile');
    // 		var rows_desktop = 1;
    // 		var rows_tab = 1;
    // 		var rows_mobile = 1;
    // 		if ($(this).data('rows-desktop') > 1)
    // 			rows_desktop = $(this).data('rows-desktop');
    // 		if ($(this).data('rows-tab') > 1)
    // 			rows_tab = $(this).data('rows-tab');
    // 		if ($(this).data('rows-mobile') > 1)
    // 			rows_mobile = $(this).data('rows-mobile');
    // 		if (rows_desktop > 1) {
    // 			$(this).slick({
    // 				rows: rows_desktop,
    // 				slidesPerRow: slide_row_desktop,
    // 				dots: true,
    // 				dotsClass: 'owl-dots',
    // 				arrows: true,
    // 				adaptiveHeight: true,
    // 				prevArrow: '<button type="button" data-role="none" class="slick-prev"><i class="icon-i-prev"></button>',
    // 				nextArrow: '<button type="button" data-role="none" class="slick-next"><i class="icon-i-next"></button>',
    // 				responsive: [{
    // 					breakpoint: 1024,
    // 					settings: {
    // 						slidesPerRow: slide_row_desktop,
    // 						rows: rows_desktop
    // 					}
    // 				}, {
    // 					breakpoint: 768,
    // 					settings: {
    // 						slidesPerRow: slide_row_tab,
    // 						rows: rows_tab
    // 					}
    // 				}, {
    // 					breakpoint: 480,
    // 					settings: {
    // 						slidesPerRow: slide_row_mobile,
    // 						rows: rows_mobile
    // 					}
    // 				}]
    // 			});
    // 		}
    // 	});
    // }

    $('.js-nav-link').on('click', function (e) {
        $(this).parents('.tabs').find('.nav-item').removeClass('active');
        $(this).parent().addClass('active');
        // $(this).parents('.tabs').find('.tabcontent').removeClass('active');
        $($(this).attr('href')).addClass('active');
        e.preventDefault();
    });

    $('.block__transfers .field__values__item').on('click', function() {
        if ($(this).hasClass('active')) {
            $(this).removeClass('active');
        } else {
            $('.block__transfers .field__values__item').removeClass('active');
            $(this).addClass('active');
        }
    });

    $('.get__sim .item__content__check').on('click', function() {
        if ($(this).parents('.get__sim__box__item').hasClass('active')) {
            $(this).parents('.get__sim__box__item').removeClass('active');
        } else {
            $('.get__sim__box__item').removeClass('active');
            $(this).parents('.get__sim__box__item').addClass('active');
        }
    });

    $('.off-canvas-toggle').on('click', function(e) {
        $("html").toggleClass("open");
    });


    $('.box-language').on('click', function(e) {
        $(this).parent().toggleClass("open-language");
    });

    $('.has-sub .current').on('click', function(e) {
        $('.has-sub .submenu').toggleClass("active");
    });

    $(document).mouseup(e => {
        if (!$('.has-sub').is(e.target) // if the target of the click isn't the container...
            &&
            $('.has-sub').has(e.target).length === 0) // ... nor a descendant of the container
        {
            $('.has-sub').removeClass('active');
        }
    });

    $('.boxmenu .show-sub, .sub-regis .show-sub.icon-next').on('click', function(e) {
        $(this).parent().toggleClass("open");
    });

    $('.box-notices .show-sub').on('click', function(e) {
        $(this).parent().toggleClass("open");
        e.preventDefault();
    });

    $('.section__tabs .tab__title').on('click', function() {
        $(this).parent().toggleClass("active");
    });

    $('.notice').on('click', function(e) {
        $(this).parents('li').toggleClass("open");
        $(this).parents('ul').removeClass("open");
        e.preventDefault();
    });

    $('.login-register .show-sub.icon-down').on('click', function(e) {
        $(this).parents('ul').toggleClass("open");
        $(this).parents('li').removeClass("open");
    });
    // $(document).on('click', '.box-filter', function() {
    //     $(this).parent().find('.filter-content').fadeToggle("slow");
    // });
    // $(document).on('click', '.close-filter', function() {
    //     $(this).parents('.filter').find('.filter-content').hide('slow');
    // });


    // START JS function bao-cao-don-hang
    $(document).on("click", ".intro-time__toggle", function(e) {
        e.preventDefault();
        $(this).parents('.intro-time__info').toggleClass('opened');
    });
    $(document).on('click', '.cus-range-price', function() {
        $(this).addClass('activePrice');
        $(this).children('.range-price__name').addClass('text-blue');
        $(this).siblings().removeClass('activePrice');
        $(this).siblings().children('.range-price__name').removeClass('text-blue');
    })

    $(document).on("click", ".intro-time__link", function(e) {
        e.preventDefault();
        $(this).parents('.intro-time__info').toggleClass('opened');
    });

    $('.intro-time__text').on('click', function(e) {
        e.preventDefault();
        $(this).parents('.intro-time__info').toggleClass('opened');
    });

    $("body").click(function(e) {
        let ignoreClass = ['intro-time__input', 'fs-angle-down', 'intro-time__link', 'intro-time__text'];
        let ignoreTag = ['input'];
        if (!ignoreClass.includes(e.target.className) && !ignoreTag.includes(e.target.localName)) {
            $('.intro-time__info').removeClass('opened');
        }
    });
    // END JS function bao-cao-don-hang

    $('.support-inner .show-support').on('click', function(e) {
        $(this).parent().toggleClass("show");
        e.preventDefault();
    });
    $(document).click(function(e) {
        var container = $(".filter-content");
        var container1 = $(".box-filter");
        if (!container.is(e.target) && container.has(e.target).length === 0 && !container1.is(e.target) && container1.has(e.target).length === 0) {
            $('.filter-content').hide('slow');
        }
    });
    $('.product-hot .tech .view-detail').on('click', function(e) {
        if ($('.tbl-tech').hasClass('open')) {
            $('.tbl-tech').removeClass('open');
            $('.product-hot .tech .view-detail').text('Xem cấu hình chi tiết');
        } else {
            $('.tbl-tech').addClass('open');
            $('.product-hot .tech .view-detail').text('Thu gọn');
        }
    });

    $('#isHome:checked').parents('.items').find('.form-info').slideDown();
    $('.hhv-form-hopdong input[type="radio"]').on('click', function() {
        if ($('#isHome').is(':checked')) {
            $('#isHome').parents('.items').find('.form-info').slideDown();
        } else {
            $('#isHome').parents('.items').find('.form-info').slideUp();

        }
    });

    $('#box-tkkm').on('click', function() {
        if ($('.tabs__detail__content__left__listkm').hasClass('open')) {
            $('.tabs__detail__content__left__listkm').removeClass('open');
        } else {
            $('.tabs__detail__content__left__listkm').addClass('open');
        }
    });

    $('.menu-slide').each(function() {
        var self = $(this);
        self.children('.menu-slide__toggle').on('click', function(e) {
            e.preventDefault();
            self.children('.menu-slide__sub').slideToggle();

            if (self.children('.menu-slide__toggle').hasClass('closed')) {
                self.children('.menu-slide__toggle').removeClass('closed');
                self.children('.menu-slide__toggle').addClass('opened');
            } else {
                self.children('.menu-slide__toggle').addClass('closed');
                self.children('.menu-slide__toggle').removeClass('opened');
            }
        });
    });

    $('.search-sp__icon').on('click', function(e) {
        $(this).parents('.search-sp').toggleClass('opened');
        e.preventDefault();
    });
    $('.contact-now__close').on('click', function(e) {
        $(this).parents('.contact-now').toggleClass('closed');
        e.preventDefault();
    });

    $('.js-show-submenu').on('click', function(e) {
        $('.menu-sp__content').addClass('show-submenu');
        $('.menu-sub').css('display', 'none');
        $('.menu-sub' + $(this).data('target')).css('display', 'block');
        $('.menu-sp__sub').addClass('active');
    });
    $('.js-close-submenu').on('click', function(e) {
        $('.menu-sp__content').removeClass('show-submenu');
        $('.menu-sp__sub').removeClass('active');
    });

    $('.menu_select_sp').on('click', function(e) {
        $(this).parents('.btabs').toggleClass('opened');
        e.preventDefault();
    })

    $('.content .btabs ul.tab-title li').on('click', function(e) {
        if (!$('.btabs').is(e.target) // if the target of the click isn't the container...
            &&
            $('.btabs').has(e.target).length === 0) // ... nor a descendant of the container
        {
            $('.btabs').removeClass('opened');
        }
    })

    $(document).mouseup(e => {
        if (!$('.btabs').is(e.target) // if the target of the click isn't the container...
            &&
            $('.btabs').has(e.target).length === 0) // ... nor a descendant of the container
        {
            $('.btabs').removeClass('opened');
        }
    });

    $('.btn-filter').on('click', function(e) {
        $(this).parents('.sort-device__button').toggleClass('opened');
        e.preventDefault();
    });
    $('.bt-result').on('click', function(e) {
        $(this).parents('.sort-device__button').toggleClass('opened');
        e.preventDefault();
    });
    $('.clear-param-filter').on('click', function(e) {
        $('.brand-filter').val('');
        $('.brand-filter').removeClass('active');
        e.preventDefault();
    });

    $('.js-toogle').on('click', function (e) {
        $(this).parents('.select-method__top').toggleClass('opened');
        e.preventDefault();

        $(this).parents('.method-payment__detail').toggleClass('opened');
        e.preventDefault();

        $(this).parents('.filter-pack').toggleClass('opened');
        e.preventDefault();
    });

});

function myFunction() {
    var myDropdown = document.getElementById("myDropdown_subtk");
    if (myDropdown.classList.contains('active')) {
        myDropdown.classList.remove('active');
    } else {
        myDropdown.classList.add('active');
    }
}

// Close the dropdown if the user clicks outside of it
//   window.onclick = function(e) {
//     if (!e.target.matches('.dropbtn')) {
//     var myDropdown = document.getElementsByClassName("myDropdown_subtk");
//       if (myDropdown && myDropdown.classList.contains('active')) {
//         myDropdown.classList.remove('active');
//       }
//     }
//   }

// Close the dropdown if the user clicks outside of it
// window.onclick = function(e) {
//     if (!e.target.matches('.intro-time__toggle')) {
//     var myDropdown = document.getElementById("intro_time_info");
//       if (myDropdown && myDropdown.classList.contains('opened')) {
//         myDropdown.classList.remove('opened');
//       }
//     }
//   }

//   $(window).scroll(function() {
// 	var scroll = $(window).scrollTop();
// 	if (scroll >= 1) {
// 		$('.js-header').addClass('header--sticky');
// 		$('body').addClass('body-sticky');
//         $('.js-lp-header').addClass('header--sticky');
// 	}
// 	if (scroll < 1) {
// 		$('.js-header').removeClass('header--sticky');
//         $('body').removeClass('body-sticky');
//         $('.js-lp-header').removeClass('header--sticky');
//     }
// });
window.onclick = function(e) {
    if (!e.target.matches('.dropbtn')) {
        var myDropdown = document.getElementsByClassName("myDropdown_subtk");
        if (myDropdown && myDropdown[0] && myDropdown.classList.contains('active')) {
            myDropdown.classList.remove('active');
        }
    }
}
// window.onclick = function(e) {
//     if (!e.target.matches('cus-modal__content')) {
//
//         var myDropdown = document.getElementsByClassName("myDropdown_subtk");
//                 if (myDropdown  && myDropdown[0] && myDropdown.classList.contains('active')) {
//                     myDropdown.classList.remove('active');
//                 }
//         $('.custom-modal--tet').hide();
//     }
// }

// Close the dropdown if the user clicks outside of it
// window.onclick = function(e) {
//     if (!e.target.matches('.intro-time__toggle')) {
//     var myDropdown = document.getElementById("intro_time_info");
//       if (myDropdown && myDropdown.classList.contains('opened')) {
//         myDropdown.classList.remove('opened');
//       }
//     }
//   }

$(window).scroll(function() {
    var scroll = $(window).scrollTop();
    if (scroll >= 1) {
        $('.js-header').addClass('header--sticky');
        $('body').addClass('body-sticky');
    }
    if (scroll < 1) {
        $('.js-header').removeClass('header--sticky');
        $('body').removeClass('body-sticky');
    }
});
$('.rules-more').on('click', function(e) {
    $(this).parents('.rules-promotion__list').toggleClass('opened');
    e.preventDefault();
});
$('.nav-sp').on('click', function(e) {
    $(this).parents('.shop-viettel__nav').toggleClass('opened');
    e.preventDefault();
});

window.onclick = function(e) {
    if (!e.target.matches('.cus-modal__content')) {
        if ($('#popup').css('display') === 'inline-block') {
            $('.modal__close').click();
        }
        if ($('#popup_quatet').css('display') === 'inline-block') {
            $('.modal__close').click();
        }
    }
}

// $('.tabs .tab-title a').on('click', function(e) {
//     $(this).parents('.tabs').find('.tab-title li').removeClass('active');
//     $(this).parent().addClass('active');
//     $(this).parents('.tabs').find('.tabcontent').removeClass('active');
//     $($(this).attr('href')).addClass('active');
//     e.preventDefault();
// });
$('.js-close-submenu-lv2').on('click', function(e) {
    $($(this).data('target')).css('display', 'none');
    $("#sme-business").css('display', 'block');
});

$('.js-box-total').on('click', function(e) {
    $(this).parents('.box-total').toggleClass('opened');
    e.preventDefault();
});
