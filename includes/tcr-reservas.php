<?php
/**
 * Plugin Name: TCR CAR RENTAL BY PARTUM DESIGN
 * Description: Formulario premium + email estructurado tipo cotizador. Precios automáticos por temporada (baja/alta) según fechas. Envía al cliente + tcr.prueba + Bryan. From fijo: tcr.prueba@partum-hosting.com
 * Version: 3.0
 * Author: Bryan_Partum
 */

if (!defined('ABSPATH')) exit;

/* =========================
   CONFIG (EDITABLE)
========================= */

function tcr_brand_name() { return 'TCR Rental'; }

/** WHATSAPP / CONTACTO */
function tcr_whatsapp_number() { return '9987773600'; }

/** CORREO SMTP (FROM fijo) */
function tcr_mail_from_email() { return 'tcr.prueba@partum-hosting.com'; }
function tcr_mail_from_name()  { return 'TCR Rental'; }

/** Correos internos (reciben copia) */
function tcr_internal_emails() {
    return [
        'tcr.prueba@partum-hosting.com',        // TCR
        'bryan.lopez@partumdesign.com.mx',      // Bryan
    ];
}

/** Renta mínima */
function tcr_min_days() { return 3; }

/** After hours (AUTOMÁTICO) */
function tcr_after_hours_price() { return 300; }
function tcr_is_after_hours($timeHHMM) {
    // after hours: 22:00–23:59 o 00:00–05:00
    if (!$timeHHMM) return false;
    $t = preg_replace('/[^0-9:]/', '', $timeHHMM);
    if (!preg_match('/^\d{2}:\d{2}$/', $t)) return false;
    [$h, $m] = array_map('intval', explode(':', $t));
    $mins = $h * 60 + $m;
    return ($mins >= 22 * 60) || ($mins <= 5 * 60);
}

/* =========================
   TEMPORADAS (AUTO)
   - Si cualquier día de la renta cae en ALTA => tarifa ALTA
   - Si no => BAJA
========================= */

/**
 * Rangos de temporada alta (cada año)
 * - Semana Santa: 1–15 abril
 * - Verano: 15 julio–10 agosto
 * - Diciembre: 12 dic–10 ene (cruza año)
 */
function tcr_high_season_ranges() {
    return [
        ['name' => 'Semana Santa', 'start_md' => '04-01', 'end_md' => '04-15'],
        ['name' => 'Verano',       'start_md' => '07-15', 'end_md' => '08-10'],
        ['name' => 'Diciembre',    'start_md' => '12-12', 'end_md' => '01-10'], // cruza año
    ];
}

/**
 * Devuelve:
 *  - ['season' => 'high'|'low', 'label' => 'Temporada alta ...'|'Temporada baja']
 * Regla: si cualquier día en [pickup_date, dropoff_date) cae en alta => alta.
 */
function tcr_detect_season($pickup_date, $dropoff_date) {
    try {
        if (!$pickup_date) {
            return ['season' => 'low', 'label' => 'Temporada baja'];
        }

        $start = new DateTime($pickup_date);
        $end = $dropoff_date ? new DateTime($dropoff_date) : (clone $start)->modify('+1 day');

        // Normalizamos: si end <= start, hacemos end = start + 1 día
        if ($end <= $start) $end = (clone $start)->modify('+1 day');

        // Iterar por día (hasta un límite razonable)
        $cursor = clone $start;
        $limit = 370; // por seguridad
        $i = 0;

        while ($cursor < $end && $i < $limit) {
            if (tcr_is_date_in_high_season($cursor)) {
                $reason = tcr_high_season_reason($cursor);
                return ['season' => 'high', 'label' => 'Temporada alta' . ($reason ? ' — '.$reason : '')];
            }
            $cursor->modify('+1 day');
            $i++;
        }

        return ['season' => 'low', 'label' => 'Temporada baja'];

    } catch (Exception $e) {
        return ['season' => 'low', 'label' => 'Temporada baja'];
    }
}

/** ¿La fecha (DateTime) cae en cualquier rango alto? */
function tcr_is_date_in_high_season(DateTime $dt) {
    $md = $dt->format('m-d');

    foreach (tcr_high_season_ranges() as $r) {
        $start = $r['start_md'];
        $end   = $r['end_md'];

        // Caso normal (no cruza año)
        if ($start <= $end) {
            if ($md >= $start && $md <= $end) return true;
        } else {
            // Cruza año (ej. 12-12 a 01-10)
            if ($md >= $start || $md <= $end) return true;
        }
    }
    return false;
}

/** Texto de razón para mostrar en UI/email (opcional) */
function tcr_high_season_reason(DateTime $dt) {
    $md = $dt->format('m-d');

    foreach (tcr_high_season_ranges() as $r) {
        $start = $r['start_md'];
        $end   = $r['end_md'];
        $name  = $r['name'];

        if ($start <= $end) {
            if ($md >= $start && $md <= $end) return $name;
        } else {
            if ($md >= $start || $md <= $end) return $name;
        }
    }
    return '';
}

/* =========================
   CATÁLOGO DE AUTOS (TODOS)
   - Precios temporada baja y alta (según tu lista)
========================= */

function tcr_default_car_image() {
    // Placeholder inline (no depende de archivos)
    $svg = rawurlencode('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#eef2ff"/><stop offset="1" stop-color="#fef2f2"/></linearGradient></defs><rect fill="url(#g)" width="100%" height="100%"/><g fill="#111827" opacity=".85"><text x="50%" y="48%" font-family="Arial" font-size="38" text-anchor="middle">TCR CAR RENTAL</text><text x="50%" y="58%" font-family="Arial" font-size="20" text-anchor="middle" opacity=".8">Imagen pendiente</text></g></svg>');
    return "data:image/svg+xml;charset=utf-8,$svg";
}

/**
 * IMPORTANTE:
 * - Mantengo imágenes reales donde ya existían en tu código.
 * - Los autos que NO tenían imagen en tu lista (Beat / Rave) quedan con placeholder.
 */
function tcr_cars_catalog() {
    $ph = tcr_default_car_image();

    return [
        // ======== COMPACTOS ========
        'Mirage G4 or Similar' => [
            'low'   => 800,
            'high'  => 1000,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/X8W_45_24MIRAGEG4-04-Front-L.png',
            'pax'   => 5,
        ],
        'March or Similar' => [
            'low'   => 600,
            'high'  => 900,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/preview-928x522-2.jpg',
            'pax'   => 5,
        ],
        'Chevrolet Onix automático' => [
            'low'   => 2000,
            'high'  => 2000,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/onix-colores_0005_Capa-1.png',
            'pax'   => 5,
        ],
        'Ignis automático' => [
            'low'   => 600,
            'high'  => 600, // antes 0 => relacionado a baja
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/ignis-gls-plus-gris-acero.webp',
            'pax'   => 5,
        ],
        'Beat or Similar' => [
            'low'   => 800,
            'high'  => 1000,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/66eb77f52d29a13eeefe2491_17e3c0b4-11ae-4376-8f19-8b154eb49763.jpg',
            'pax'   => 5,
        ],
        'Aveo or Similar' => [
            'low'   => 900,
            'high'  => 900,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/RT_V_1a1944dc0bf848808dfe503014b177af-1.webp',
            'pax'   => 5,
        ],
        'Versa estándar or Similar' => [
            'low'   => 800,
            'high'  => 1000,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/maxresdefault.jpg',
            'pax'   => 5,
        ],
        'Versa automático' => [
            'low'   => 900,
            'high'  => 1500,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/Nissan-Versa-2019-7.jpg',
            'pax'   => 5,
        ],
        'VW Vento' => [
            'low'   => 800,
            'high'  => 1400,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/Vento-fb-og.jpg',
            'pax'   => 5,
        ],
        'Dodge Attitude' => [
            'low'   => 800,
            'high'  => 1000,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/NAZ_4f158cc36a3c4d228dd45d8be9685f63.jpg',
            'pax'   => 5,
        ],
        'Kia Rio' => [
            'low'   => 1200,
            'high'  => 1500,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/2018_Kia_Rio_EX_-_Side.jpg',
            'pax'   => 5,
        ],
        'Rave or Similar' => [
            'low'   => 1200,
            'high'  => 1200, // antes 0 => relacionado a baja
            'image' => $ph,
            'pax'   => 5,
        ],

        // ======== SEDAN PREMIUM ========
        'Jetta 2.0' => [
            'low'   => 1500,
            'high'  => 1800,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/hq720.jpg',
            'pax'   => 5,
        ],

        // ======== 7 PASAJEROS / VAN ========
        'Toyota Avanza automática (7 pasajeros)' => [
            'low'   => 2000,  // antes 0 => ajustado para no quedar sin precio
            'high'  => 2000,  // relacionado a baja
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/rojo3-scaled.jpg',
            'pax'   => 7,
        ],
        'Mitsubishi Xpander automático (7 pasajeros)' => [
            'low'   => 3000,
            'high'  => 3000,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/RENTA-XPANDER-SUV-1.webp',
            'pax'   => 7,
        ],
        'Captiva 7 pasajeros' => [
            'low'   => 1400,
            'high'  => 1400, // antes 0 => relacionado a baja
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/color-captiva-xl-rojo.avif',
            'pax'   => 7,
        ],
        'Town & Country' => [
            'low'   => 1800,
            'high'  => 2500,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/towncountry.png',
            'pax'   => 7,
        ],
        'Grand Caravan' => [
            'low'   => 1800,
            'high'  => 2500,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/2019_RT_PXR_X1_RTKH532DS29SAPA_fronthero___trn-1024x712-1.png',
            'pax'   => 7,
        ],
        'Toyota Hiace or Similar' => [
            'low'   => 2500,
            'high'  => 3500,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/blanco.png',
            'pax'   => 12,
        ],

        // ======== SUV ========
        'Toyota RAV4' => [
            'low'   => 1400,
            'high'  => 1400, // antes 0 => relacionado a baja
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/blanco3-scaled.jpg',
            'pax'   => 5,
        ],
        'Suburban SUV' => [
            'low'   => 3500,
            'high'  => 7500,
            'image' => 'https://tcrcarrental.com/wp-content/uploads/2026/01/negro-metalico.avif',
            'pax'   => 7,
        ],
    ];
}


/* =========================
   EXTRAS
========================= */
function tcr_extras_catalog() {
    return [
        'baby_seat'    => ['label' => 'Silla de bebé', 'price' => 100],
        'extra_driver' => ['label' => 'Conductor adicional', 'price' => 95],
    ];
}

/* =========================
   Ubicaciones + cargo extra por ciudad
========================= */
function tcr_locations_with_fees() {
    return [
        ['label' => 'Cancún', 'fee' => 0],
        ['label' => 'Cancún zona hotelera', 'fee' => 400],
        ['label' => 'Puerto Morelos', 'fee' => 500],
        ['label' => 'Playa del Carmen', 'fee' => 900],
        ['label' => 'Tulum', 'fee' => 1500],
        ['label' => 'Chetumal', 'fee' => 3800],
        ['label' => 'Mérida', 'fee' => 3400],
        ['label' => 'Los Cabos San Lucas', 'fee' => 0],
        ['label' => 'México DF', 'fee' => 0],
    ];
}

/* =========================
   “Su renta incluye”
========================= */
function tcr_renta_incluye_list() {
    return [
        'Seguro de colisión y robo con deducible del 10%',
        'Kilometraje libre',
        'Seguro de responsabilidad civil',
        'Impuestos federales',
        'Impuestos aeroportuarios',
        'Seguro de gastos médicos',
        'Asistencia legal',
        'Transporte gratuito de Aeropuerto a oficina y de oficina a Aeropuerto',
    ];
}

/* =========================
   FORZAR FROM (WP_MAIL)
========================= */
add_filter('wp_mail_from', function($from){ return tcr_mail_from_email(); });
add_filter('wp_mail_from_name', function($name){ return tcr_mail_from_name(); });

/* =========================
   HELPER: obtener tarifa diaria por temporada
========================= */
function tcr_get_daily_price_for_dates($carData, $pickup_date, $dropoff_date) {
    $seasonInfo = tcr_detect_season($pickup_date, $dropoff_date);
    $season = $seasonInfo['season']; // 'high'|'low'

    $low  = isset($carData['low'])  ? (float)$carData['low']  : 0.0;
    $high = isset($carData['high']) ? (float)$carData['high'] : 0.0;

    // Si en alta no hay precio definido (0), cae a baja (para no romper cotizador)
    if ($season === 'high') {
        return ($high > 0) ? $high : $low;
    }
    return $low;
}

/* =========================
   SHORTCODE: [tcr_reservation_form]
========================= */
add_shortcode('tcr_reservation_form', function () {

    $cars = tcr_cars_catalog();
    $extras = tcr_extras_catalog();
    $locations = tcr_locations_with_fees();
    $incluye = tcr_renta_incluye_list();

    $firstCarName = array_key_first($cars);
    $firstCar = $cars[$firstCarName];

    ob_start(); ?>

    <div id="tcr-reserva">
        <form class="tcr-card" method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <?php wp_nonce_field('tcr_res_nonce', 'tcr_res_nonce_field'); ?>
            <input type="hidden" name="action" value="tcr_submit_reservation">

            <div class="tcr-header">
                <div class="tcr-chip"><?php echo esc_html(tcr_brand_name()); ?></div>
                <h2 class="tcr-title">Confirmación de <span>reservación</span></h2>

                <p class="tcr-sub">
                    Completa tus datos y envía tu solicitud.
                    En un periodo máximo de <strong>24 horas</strong> te contactaremos para confirmación y envío del <strong>link de pago PayPal</strong>.
                </p>

                <p class="tcr-sub tcr-sub-mini" id="tcr_season_label">Temporada baja</p>
            </div>

            <div class="tcr-grid">
                <!-- LEFT (FORM) -->
                <div class="tcr-left">

                    <div class="tcr-row2">
                        <div class="tcr-field">
                            <label>Idioma *</label>
                            <select class="tcr-input" name="language" required>
                                <option value="Español" selected>Español</option>
                                <option value="English">English</option>
                            </select>
                        </div>

                        <div class="tcr-field">
                            <label>Auto *</label>
                            <select class="tcr-input" name="car" id="tcr_car" required>
                                <?php foreach ($cars as $name => $data): ?>
                                    <option value="<?php echo esc_attr($name); ?>"
                                            data-low="<?php echo esc_attr((float)($data['low'] ?? 0)); ?>"
                                            data-high="<?php echo esc_attr((float)($data['high'] ?? 0)); ?>"
                                            data-image="<?php echo esc_url($data['image'] ?? tcr_default_car_image()); ?>"
                                            data-pax="<?php echo esc_attr($data['pax'] ?? ''); ?>">
                                        <?php
                                          $low  = (float)($data['low'] ?? 0);
                                          $high = (float)($data['high'] ?? 0);
                                          echo esc_html($name . ' — Baja $' . number_format($low, 0) . ' / día' . ($high>0 ? ' | Alta $' . number_format($high,0).' / día' : ''));
                                        ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <div class="tcr-help">* Precio por día. Total estimado se calcula con días + cargos + extras. La tarifa (baja/alta) se asigna automáticamente por fecha.</div>
                        </div>
                    </div>

                    <div class="tcr-row2">
                        <div class="tcr-field">
                            <label>Ubicación de entrega *</label>
                            <select class="tcr-input" name="pickup_location" id="tcr_pickup_location" required>
                                <option value="">Selecciona…</option>
                                <?php foreach ($locations as $loc): ?>
                                    <option value="<?php echo esc_attr($loc['label']); ?>"
                                            data-city-fee="<?php echo esc_attr($loc['fee']); ?>">
                                        <?php echo esc_html($loc['label']); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <div class="tcr-help">* Algunas ubicaciones pueden incluir cargo extra por ciudad.</div>
                        </div>

                        <div class="tcr-field">
                            <label>Ubicación de devolución *</label>
                            <select class="tcr-input" name="dropoff_location" id="tcr_dropoff_location" required>
                                <option value="">Selecciona…</option>
                                <?php foreach ($locations as $loc): ?>
                                    <option value="<?php echo esc_attr($loc['label']); ?>"
                                            data-city-fee="<?php echo esc_attr($loc['fee']); ?>">
                                        <?php echo esc_html($loc['label']); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <div class="tcr-help">* Cargos extra se suman por entrega y/o devolución.</div>
                        </div>
                    </div>

                    <div class="tcr-row2">
                        <div class="tcr-field">
                            <label>Fecha de entrega *</label>
                            <input class="tcr-input" type="date" name="pickup_date" id="tcr_pickup_date" required>
                        </div>
                        <div class="tcr-field">
                            <label>Hora de entrega *</label>
                            <input class="tcr-input" type="time" name="pickup_time" id="tcr_pickup_time" required value="12:00">
                            <div class="tcr-help">* Si es 10:00 pm a 5:00 am se aplica cargo fuera de horario automáticamente.</div>
                        </div>
                    </div>

                    <div class="tcr-row2">
                        <div class="tcr-field">
                            <label>Fecha de devolución *</label>
                            <input class="tcr-input" type="date" name="dropoff_date" id="tcr_dropoff_date" required>
                        </div>
                        <div class="tcr-field">
                            <label>Hora de devolución *</label>
                            <input class="tcr-input" type="time" name="dropoff_time" id="tcr_dropoff_time" required value="12:00">
                            <div class="tcr-help">* Si es 10:00 pm a 5:00 am se aplica cargo fuera de horario automáticamente.</div>
                        </div>
                    </div>

                    <div class="tcr-row2">
                        <div class="tcr-field">
                            <label>Nombre *</label>
                            <input class="tcr-input" type="text" name="first_name" required>
                        </div>
                        <div class="tcr-field">
                            <label>Apellidos *</label>
                            <input class="tcr-input" type="text" name="last_name" required>
                        </div>
                    </div>

                    <div class="tcr-row2">
                        <div class="tcr-field">
                            <label>Email *</label>
                            <input class="tcr-input" type="email" name="email" required>
                        </div>
                        <div class="tcr-field">
                            <label>Teléfono</label>
                            <input class="tcr-input" type="text" name="phone" placeholder="+52…">
                        </div>
                    </div>

                    <div class="tcr-row2">
                        <div class="tcr-field">
                            <label>Aerolínea</label>
                            <input class="tcr-input" type="text" name="airline" placeholder="Opcional">
                        </div>
                        <div class="tcr-field">
                            <label>Hotel *</label>
                            <input class="tcr-input" type="text" name="hotel" required>
                        </div>
                    </div>

                    <div class="tcr-row2">
                        <div class="tcr-field">
                            <label>Ciudad origen *</label>
                            <input class="tcr-input" type="text" name="origin_city" required>
                        </div>
                        <div class="tcr-field">
                            <label>Número de vuelo</label>
                            <input class="tcr-input" type="text" name="flight_number" placeholder="Opcional">
                            <div class="tcr-help">* El número de vuelo NO es obligatorio.</div>
                        </div>
                    </div>

                    <div class="tcr-row2">
                        <div class="tcr-field">
                            <label>Número de pasajeros *</label>
                            <input class="tcr-input" type="number" name="passengers" min="1" required value="4">
                        </div>
                        <div class="tcr-field tcr-check">
                            <input type="checkbox" id="tcr_connection" name="connection" value="1">
                            <label class="tcr-check-label" for="tcr_connection">Conexión</label>
                        </div>
                    </div>

                    <div class="tcr-field">
                        <label>Comentarios adicionales</label>
                        <textarea class="tcr-input" name="comments" rows="4" placeholder="Ej. Llegamos tarde, favor de contactar por WhatsApp…"></textarea>
                    </div>

                    <!-- TOTAL EN MÓVIL ANTES DE ENVIAR -->
                    <div class="tcr-mobile-summary">
                        <div class="tcr-mobile-row">
                            <span>Días (mín. <?php echo (int)tcr_min_days(); ?>)</span>
                            <strong id="tcr_days_mobile">—</strong>
                        </div>
                        <div class="tcr-mobile-row">
                            <span>Cargo por ciudad</span>
                            <strong id="tcr_city_mobile">$0.00</strong>
                        </div>
                        <div class="tcr-mobile-row">
                            <span>Fuera de horario</span>
                            <strong id="tcr_after_mobile">$0.00</strong>
                        </div>
                        <div class="tcr-mobile-row tcr-mobile-total">
                            <span>Total estimado</span>
                            <strong id="tcr_total_mobile">$0.00</strong>
                        </div>
                        <div class="tcr-mobile-mini">
                            * Confirmación y link PayPal en máximo 24 horas.
                        </div>
                    </div>

                    <button class="tcr-btn" type="submit">Enviar solicitud</button>

                    <p class="tcr-footnote">
                        Renta mínima: <strong><?php echo esc_html(tcr_min_days()); ?> días</strong>.  
                        El link de pago PayPal se enviará posteriormente (máximo 24 horas).
                        <br>
                        Si no recibe confirmación, revise <strong>Spam</strong> o contáctenos por WhatsApp: <strong><?php echo esc_html(tcr_whatsapp_number()); ?></strong>
                    </p>
                </div>

                <!-- RIGHT -->
                <aside class="tcr-right">
                    <div class="tcr-preview">
                        <img id="tcr_car_img" src="<?php echo esc_url($firstCar['image'] ?? tcr_default_car_image()); ?>" alt="Auto">
                        <div class="tcr-preview-meta">
                            <div class="tcr-preview-brand"><?php echo esc_html(tcr_brand_name()); ?></div>
                            <div class="tcr-preview-title" id="tcr_car_title"><?php echo esc_html($firstCarName); ?></div>
                            <div class="tcr-preview-sub" id="tcr_daily_price"></div>
                            <div class="tcr-mini2">
                                * Importe estimado. Confirmación y link PayPal en máximo 24h.<br>
                                WhatsApp: <strong><?php echo esc_html(tcr_whatsapp_number()); ?></strong>
                            </div>
                        </div>
                    </div>

                    <div class="tcr-panel">
                        <h3 class="tcr-panel-title">Extras</h3>
                        <?php foreach ($extras as $key => $ex): ?>
                            <label class="tcr-extra">
                                <span class="tcr-extra-left">
                                    <input type="checkbox" name="extras[]"
                                           value="<?php echo esc_attr($key); ?>"
                                           data-extra-price="<?php echo esc_attr($ex['price']); ?>">
                                    <span class="tcr-extra-label"><?php echo esc_html($ex['label']); ?></span>
                                </span>
                                <span class="tcr-extra-price">$<?php echo number_format($ex['price'], 2); ?></span>
                            </label>
                        <?php endforeach; ?>

                        <!-- AUTO FEE -->
                        <div class="tcr-auto-fee" id="tcr_after_hours_box" style="display:none;">
                          <div class="tcr-auto-fee-left">
                            <div class="tcr-auto-fee-title">Cargo fuera de horario</div>
                            <div class="tcr-auto-fee-sub">(10:00 pm a 5:00 am) — activado automáticamente</div>
                          </div>
                          <div class="tcr-auto-fee-price" id="tcr_after_hours_price">$0.00</div>
                        </div>

                        <div class="tcr-help" style="margin-top:10px;">
                            * “Fuera de horario” se activa automáticamente si la entrega o devolución cae entre <strong>10:00 pm y 5:00 am</strong>.
                        </div>
                    </div>

                    <div class="tcr-panel">
                        <h3 class="tcr-panel-title">Resumen</h3>
                        <div class="tcr-sumrow"><span>Temporada</span><strong id="tcr_season_badge">Baja</strong></div>
                        <div class="tcr-sumrow"><span>Días</span><strong id="tcr_days">—</strong></div>
                        <div class="tcr-sumrow"><span>Importe auto</span><strong id="tcr_car_amount">$0.00</strong></div>
                        <div class="tcr-sumrow"><span>Cargo por ciudad</span><strong id="tcr_city_amount">$0.00</strong></div>
                        <div class="tcr-sumrow"><span>Fuera de horario</span><strong id="tcr_after_amount">$0.00</strong></div>
                        <div class="tcr-sumrow"><span>Extras</span><strong id="tcr_extras_amount">$0.00</strong></div>
                        <div class="tcr-divider"></div>
                        <div class="tcr-sumrow"><span>Total</span><strong class="tcr-total" id="tcr_total">$0.00</strong></div>
                    </div>

                    <div class="tcr-panel">
                        <h3 class="tcr-panel-title">Su renta incluye</h3>
                        <ul class="tcr-incluye">
                            <?php foreach ($incluye as $item): ?>
                                <li><?php echo esc_html($item); ?></li>
                            <?php endforeach; ?>
                        </ul>
                    </div>
                </aside>
            </div>
        </form>

        <!-- ✅ STICKY TOTAL MÓVIL (SIEMPRE VISIBLE) -->
        <div class="tcr-sticky-total" aria-live="polite">
          <div class="tcr-sticky-inner">
            <div class="tcr-sticky-info">
              <span>Total estimado</span>
              <strong id="tcr_sticky_total">$0.00</strong>
            </div>
            <button type="button" class="tcr-sticky-btn"
              onclick="document.querySelector('#tcr-reserva .tcr-btn').scrollIntoView({behavior:'smooth', block:'center'})">
              Ver / Enviar
            </button>
          </div>
        </div>

        <style>
        #tcr-reserva{
          --tcr-primary:#1da1f2;
          --tcr-accent:#ff6b5c;
          --tcr-soft:#f5f9fc;
          --tcr-text:#1f2937;
          --tcr-muted:#6b7280;
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        }
        #tcr-reserva, #tcr-reserva *{box-sizing:border-box}

        #tcr-reserva .tcr-card{
          max-width:1200px;margin:0 auto;
          background:#fff;border-radius:28px;
          padding:32px;
          box-shadow:0 20px 40px rgba(0,0,0,.08);
          animation:tcrFadeUp .6s ease both;
        }

        #tcr-reserva .tcr-header{text-align:center;margin-bottom:26px}
        #tcr-reserva .tcr-chip{
          display:inline-block;
          padding:8px 14px;border-radius:999px;
          background:rgba(29,161,242,.12);
          color:var(--tcr-primary);
          font-weight:900;font-size:12px;letter-spacing:.12em;
          margin-bottom:10px;
        }
        #tcr-reserva .tcr-title{
          font-size:clamp(28px,4vw,44px);
          font-weight:900;margin:0;color:var(--tcr-text);
          line-height:1.08;
        }
        #tcr-reserva .tcr-title span{color:var(--tcr-accent)}
        #tcr-reserva .tcr-sub{
          max-width:820px;margin:14px auto 0;
          color:var(--tcr-muted);
          font-size:16px;line-height:1.65;
        }
        #tcr-reserva .tcr-sub-mini{font-size:13px;opacity:.92}

        #tcr-reserva .tcr-grid{
          display:grid;
          grid-template-columns:1.2fr .8fr;
          gap:26px;
        }
        @media(max-width:900px){
          #tcr-reserva .tcr-grid{grid-template-columns:1fr}
          #tcr-reserva .tcr-card{padding:18px;border-radius:20px}
        }

        #tcr-reserva .tcr-left{display:grid;gap:12px}
        #tcr-reserva .tcr-right{display:grid;gap:14px}

        #tcr-reserva .tcr-row2{
          display:grid;grid-template-columns:1fr 1fr;gap:12px
        }
        @media(max-width:640px){
          #tcr-reserva .tcr-row2{grid-template-columns:1fr}
        }

        #tcr-reserva label{
          display:block;
          font-size:14px;font-weight:800;
          margin-bottom:6px;color:var(--tcr-text);
        }

        #tcr-reserva .tcr-help{
          margin-top:6px;
          font-size:12px;
          color:var(--tcr-muted);
          line-height:1.4;
        }

        #tcr-reserva .tcr-input{
          width:100%;
          padding:14px 16px;
          border-radius:14px;
          border:1px solid #e5e7eb;
          background:#fff;
          font-size:15px;
          transition:.25s ease;
        }
        #tcr-reserva .tcr-input:focus{
          outline:none;
          border-color:var(--tcr-primary);
          box-shadow:0 0 0 4px rgba(29,161,242,.15);
        }

        #tcr-reserva .tcr-check{
          display:flex;align-items:center;gap:10px;
          padding-top:26px;
        }
        #tcr-reserva .tcr-check input{width:auto;transform:scale(1.15)}
        #tcr-reserva .tcr-check-label{margin:0;font-weight:900}

        #tcr-reserva .tcr-btn{
          width:100%;
          margin-top:6px;
          padding:18px;
          border:none;border-radius:18px;
          font-size:17px;font-weight:900;
          cursor:pointer;color:#fff;
          background:linear-gradient(135deg,var(--tcr-primary),var(--tcr-accent));
          box-shadow:0 12px 26px rgba(29,161,242,.28);
          transition:.3s ease;
        }
        #tcr-reserva .tcr-btn:hover{
          transform:translateY(-2px);
          box-shadow:0 16px 32px rgba(29,161,242,.35);
        }

        #tcr-reserva .tcr-footnote{
          margin:0;
          color:var(--tcr-muted);
          font-size:12px;line-height:1.55;
          text-align:center;
        }

        #tcr-reserva .tcr-preview{
          background:var(--tcr-soft);
          border-radius:24px;
          overflow:hidden;
          box-shadow:0 10px 22px rgba(0,0,0,.06);
          transition:.35s ease;
          animation:tcrFadeUp .7s ease both;
        }
        #tcr-reserva .tcr-preview img{
          width:100%;
          height:260px;
          object-fit:contain;
          display:block;
          transition:.4s ease;
          background:#fff;
        }
        #tcr-reserva .tcr-preview:hover img{transform:scale(1.03)}
        #tcr-reserva .tcr-preview-meta{padding:18px}
        #tcr-reserva .tcr-preview-brand{
          display:inline-block;
          font-weight:900;
          color:var(--tcr-primary);
          font-size:12px;
          letter-spacing:.10em;
          margin-bottom:6px;
        }
        #tcr-reserva .tcr-preview-title{
          font-size:20px;font-weight:900;color:var(--tcr-text);
        }
        #tcr-reserva .tcr-preview-sub{
          margin-top:8px;
          color:var(--tcr-primary);
          font-weight:900;
        }
        #tcr-reserva .tcr-mini2{
          margin-top:10px;
          color:var(--tcr-muted);
          font-size:12px;
          line-height:1.45;
        }

        #tcr-reserva .tcr-panel{
          background:var(--tcr-soft);
          border-radius:24px;
          padding:18px;
          box-shadow:0 10px 22px rgba(0,0,0,.05);
          animation:tcrFadeUp .8s ease both;
        }
        #tcr-reserva .tcr-panel-title{
          margin:0 0 12px;
          font-size:16px;
          font-weight:900;
          color:var(--tcr-text);
        }

        #tcr-reserva .tcr-extra{
          display:flex;justify-content:space-between;align-items:center;
          padding:14px 16px;border-radius:16px;
          border:1px solid #e5e7eb;background:#fff;
          margin-bottom:12px;cursor:pointer;
          transition:.25s ease;
        }
        #tcr-reserva .tcr-extra:hover{
          border-color:var(--tcr-primary);
          transform:translateY(-2px);
          box-shadow:0 12px 20px rgba(0,0,0,.06);
        }
        #tcr-reserva .tcr-extra-left{display:flex;align-items:center;gap:10px}
        #tcr-reserva .tcr-extra input{width:auto;transform:scale(1.15)}
        #tcr-reserva .tcr-extra-label{font-weight:900;color:var(--tcr-text)}
        #tcr-reserva .tcr-extra-price{font-weight:900;color:var(--tcr-muted)}

        #tcr-reserva .tcr-auto-fee{
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          padding:14px 16px;
          border-radius:16px;
          border:1px solid rgba(255,107,92,.35);
          background:rgba(255,107,92,.08);
          margin-top:8px;
        }
        #tcr-reserva .tcr-auto-fee-title{font-weight:900;color:var(--tcr-text)}
        #tcr-reserva .tcr-auto-fee-sub{font-size:12px;color:var(--tcr-muted);margin-top:4px}
        #tcr-reserva .tcr-auto-fee-price{font-weight:900;color:var(--tcr-accent);white-space:nowrap}

        #tcr-reserva .tcr-sumrow{
          display:flex;justify-content:space-between;align-items:center;
          padding:10px 0;
          font-weight:900;color:var(--tcr-text);
        }
        #tcr-reserva .tcr-divider{height:1px;background:rgba(0,0,0,.08);margin:6px 0}
        #tcr-reserva .tcr-total{font-size:22px;color:var(--tcr-accent)}

        #tcr-reserva .tcr-incluye{
          margin:0; padding-left:18px;
          color:var(--tcr-muted);
          line-height:1.6;
          font-size:13px;
        }
        #tcr-reserva .tcr-incluye li{margin:6px 0}

        #tcr-reserva .tcr-mobile-summary{
          display:none;
          background:rgba(29,161,242,.08);
          border:1px solid rgba(29,161,242,.18);
          border-radius:18px;
          padding:14px 16px;
        }
        #tcr-reserva .tcr-mobile-row{
          display:flex;justify-content:space-between;align-items:center;
          font-weight:900;color:var(--tcr-text);
          padding:6px 0;
        }
        #tcr-reserva .tcr-mobile-total strong{color:var(--tcr-accent);font-size:18px}
        #tcr-reserva .tcr-mobile-mini{
          margin-top:6px;
          color:var(--tcr-muted);
          font-size:12px;
          line-height:1.45;
        }
        @media(max-width:900px){ #tcr-reserva .tcr-mobile-summary{display:block} }

        #tcr-reserva .tcr-sticky-total{display:none}
        @media(max-width:900px){
          #tcr-reserva .tcr-sticky-total{
            display:block;
            position:fixed;
            bottom:0; left:0;
            width:100%;
            z-index:9999;
            background:rgba(255,255,255,.96);
            backdrop-filter:blur(8px);
            border-top:1px solid rgba(0,0,0,.08);
            box-shadow:0 -10px 25px rgba(0,0,0,.08);
          }
          #tcr-reserva .tcr-sticky-inner{
            max-width:1200px;
            margin:0 auto;
            padding:12px 16px;
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
          }
          #tcr-reserva .tcr-sticky-info span{
            display:block;
            font-size:12px;
            color:var(--tcr-muted);
            font-weight:800;
          }
          #tcr-reserva .tcr-sticky-info strong{
            font-size:20px;
            font-weight:900;
            color:var(--tcr-accent);
            line-height:1.1;
          }
          #tcr-reserva .tcr-sticky-btn{
            border:none;
            border-radius:14px;
            padding:12px 16px;
            font-size:14px;
            font-weight:900;
            cursor:pointer;
            color:#fff;
            background:linear-gradient(135deg,var(--tcr-primary),var(--tcr-accent));
            box-shadow:0 10px 20px rgba(29,161,242,.3);
            white-space:nowrap;
          }
        }
        @media(max-width:900px){ #tcr-reserva .tcr-card{ padding-bottom:90px; } }

        @keyframes tcrFadeUp{ from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
        </style>

        <script>
        (function(){
          const scope = document.getElementById('tcr-reserva');
          if(!scope) return;

          const carSel = scope.querySelector('#tcr_car');
          const carImg = scope.querySelector('#tcr_car_img');
          const carTitle = scope.querySelector('#tcr_car_title');
          const daily = scope.querySelector('#tcr_daily_price');

          const pickup = scope.querySelector('#tcr_pickup_date');
          const dropoff = scope.querySelector('#tcr_dropoff_date');

          const pickupLoc = scope.querySelector('#tcr_pickup_location');
          const dropoffLoc = scope.querySelector('#tcr_dropoff_location');

          const pickupTime = scope.querySelector('#tcr_pickup_time');
          const dropoffTime = scope.querySelector('#tcr_dropoff_time');

          const extras = scope.querySelectorAll('[data-extra-price]');

          const seasonLabel = scope.querySelector('#tcr_season_label');
          const seasonBadge = scope.querySelector('#tcr_season_badge');

          const daysEl = scope.querySelector('#tcr_days');
          const carAmountEl = scope.querySelector('#tcr_car_amount');
          const cityAmountEl = scope.querySelector('#tcr_city_amount');
          const afterAmountEl = scope.querySelector('#tcr_after_amount');
          const extrasAmountEl = scope.querySelector('#tcr_extras_amount');
          const totalEl = scope.querySelector('#tcr_total');

          const daysMobile = scope.querySelector('#tcr_days_mobile');
          const totalMobile = scope.querySelector('#tcr_total_mobile');
          const cityMobile = scope.querySelector('#tcr_city_mobile');
          const afterMobile = scope.querySelector('#tcr_after_mobile');
          const stickyTotal = scope.querySelector('#tcr_sticky_total');

          const afterBox = scope.querySelector('#tcr_after_hours_box');
          const afterPriceEl = scope.querySelector('#tcr_after_hours_price');

          const MIN_DAYS = <?php echo (int)tcr_min_days(); ?>;
          const AFTER_HOURS_PRICE = <?php echo (int)tcr_after_hours_price(); ?>;

          // Temporadas altas: (mm-dd) rangos
          const HIGH_RANGES = [
            {name:'Semana Santa', start:'04-01', end:'04-15'},
            {name:'Verano',       start:'07-15', end:'08-10'},
            {name:'Diciembre',    start:'12-12', end:'01-10'} // cruza año
          ];

          function money(n){
            try{ return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n); }
            catch(e){ return '$' + (Math.round(n*100)/100).toFixed(2); }
          }

          function md(d){
            const m = String(d.getMonth()+1).padStart(2,'0');
            const day = String(d.getDate()).padStart(2,'0');
            return m + '-' + day;
          }

          function isMdInRange(mdStr, start, end){
            // normal
            if(start <= end){
              return mdStr >= start && mdStr <= end;
            }
            // cruza año
            return (mdStr >= start) || (mdStr <= end);
          }

          function detectSeason(pickupDateStr, dropoffDateStr){
            if(!pickupDateStr) return {season:'low', label:'Temporada baja'};
            const start = new Date(pickupDateStr+'T00:00:00');
            let end = dropoffDateStr ? new Date(dropoffDateStr+'T00:00:00') : new Date(start.getTime()+86400000);
            if(end <= start) end = new Date(start.getTime()+86400000);

            // iterar días
            let cur = new Date(start);
            let i = 0;
            while(cur < end && i < 370){
              const mdStr = md(cur);
              for(const r of HIGH_RANGES){
                if(isMdInRange(mdStr, r.start, r.end)){
                  return {season:'high', label:'Temporada alta — ' + r.name};
                }
              }
              cur.setDate(cur.getDate()+1);
              i++;
            }
            return {season:'low', label:'Temporada baja'};
          }

          function calcDays(){
            if(!pickup.value || !dropoff.value) return null;
            const d1 = new Date(pickup.value + 'T00:00:00');
            const d2 = new Date(dropoff.value + 'T00:00:00');
            let diff = Math.ceil((d2 - d1) / (1000*60*60*24));
            if(isNaN(diff) || diff < 1) diff = 1;
            if(diff < MIN_DAYS) diff = MIN_DAYS;
            return diff;
          }

          function getCityFee(selectEl){
            if(!selectEl) return 0;
            const opt = selectEl.options[selectEl.selectedIndex];
            if(!opt) return 0;
            return parseFloat(opt.dataset.cityFee || '0') || 0;
          }

          function isAfterHours(timeVal){
            if(!timeVal) return false;
            const parts = timeVal.split(':');
            if(parts.length < 2) return false;
            const h = Number(parts[0]), m = Number(parts[1]);
            if(Number.isNaN(h) || Number.isNaN(m)) return false;
            const mins = h*60 + m;
            return (mins >= 22*60) || (mins <= 5*60);
          }

          function getDailyPrice(opt, season){
            const low  = parseFloat(opt.dataset.low || '0') || 0;
            const high = parseFloat(opt.dataset.high || '0') || 0;
            if(season === 'high'){
              return high > 0 ? high : low;
            }
            return low;
          }

          function render(){
            const opt = carSel.options[carSel.selectedIndex];
            const img = opt.dataset.image || '';
            const name = opt.value || '';

            if(img) carImg.src = img;
            carTitle.textContent = name;

            const season = detectSeason(pickup.value, dropoff.value);
            if(seasonLabel) seasonLabel.textContent = season.label;
            if(seasonBadge) seasonBadge.textContent = (season.season === 'high') ? 'Alta' : 'Baja';

            const price = getDailyPrice(opt, season.season);
            daily.textContent = money(price) + ' / día';

            let ex = 0;
            extras.forEach(e=>{ if(e.checked) ex += parseFloat(e.dataset.extraPrice || '0'); });

            const cityFee = getCityFee(pickupLoc) + getCityFee(dropoffLoc);

            const pickupAfter = pickupTime ? isAfterHours(pickupTime.value) : false;
            const dropoffAfter = dropoffTime ? isAfterHours(dropoffTime.value) : false;
            const afterHoursFee = (pickupAfter || dropoffAfter) ? AFTER_HOURS_PRICE : 0;

            if(afterBox && afterPriceEl){
              if(afterHoursFee > 0){
                afterBox.style.display = 'flex';
                afterPriceEl.textContent = money(afterHoursFee);
              } else {
                afterBox.style.display = 'none';
                afterPriceEl.textContent = money(0);
              }
            }

            const d = calcDays();

            if(d === null){
              const partial = cityFee + ex + afterHoursFee;

              daysEl.textContent = '—';
              carAmountEl.textContent = money(0);
              cityAmountEl.textContent = money(cityFee);
              afterAmountEl.textContent = money(afterHoursFee);
              extrasAmountEl.textContent = money(ex);
              totalEl.textContent = money(partial);

              if(daysMobile) daysMobile.textContent = '—';
              if(cityMobile) cityMobile.textContent = money(cityFee);
              if(afterMobile) afterMobile.textContent = money(afterHoursFee);
              if(totalMobile) totalMobile.textContent = money(partial);
              if(stickyTotal) stickyTotal.textContent = money(partial);
              return;
            }

            const carAmount = price * d;
            const total = carAmount + cityFee + ex + afterHoursFee;

            daysEl.textContent = String(d);
            carAmountEl.textContent = money(carAmount);
            cityAmountEl.textContent = money(cityFee);
            afterAmountEl.textContent = money(afterHoursFee);
            extrasAmountEl.textContent = money(ex);
            totalEl.textContent = money(total);

            if(daysMobile) daysMobile.textContent = String(d);
            if(cityMobile) cityMobile.textContent = money(cityFee);
            if(afterMobile) afterMobile.textContent = money(afterHoursFee);
            if(totalMobile) totalMobile.textContent = money(total);
            if(stickyTotal) stickyTotal.textContent = money(total);
          }

          carSel.addEventListener('change', render);
          pickup.addEventListener('change', render);
          dropoff.addEventListener('change', render);
          if(pickupLoc) pickupLoc.addEventListener('change', render);
          if(dropoffLoc) dropoffLoc.addEventListener('change', render);
          if(pickupTime) pickupTime.addEventListener('change', render);
          if(dropoffTime) dropoffTime.addEventListener('change', render);
          extras.forEach(e=> e.addEventListener('change', render));
          render();
        })();
        </script>
    </div>

    <?php
    return ob_get_clean();
});

/* =========================
   SUBMIT HANDLER
========================= */
add_action('admin_post_nopriv_tcr_submit_reservation', 'tcr_submit_reservation');
add_action('admin_post_tcr_submit_reservation', 'tcr_submit_reservation');

function tcr_submit_reservation() {

    if (!isset($_POST['tcr_res_nonce_field']) || !wp_verify_nonce($_POST['tcr_res_nonce_field'], 'tcr_res_nonce')) {
        wp_die('Security check failed.');
    }

    $cars = tcr_cars_catalog();
    $extrasCatalog = tcr_extras_catalog();
    $incluye = tcr_renta_incluye_list();
    $locations = tcr_locations_with_fees();

    $feeByLabel = [];
    foreach ($locations as $l) $feeByLabel[$l['label']] = (float)$l['fee'];

    $language = sanitize_text_field($_POST['language'] ?? 'Español');
    $car = sanitize_text_field($_POST['car'] ?? '');
    if (!isset($cars[$car])) wp_die('Auto inválido.');

    $pickup_location = sanitize_text_field($_POST['pickup_location'] ?? '');
    $dropoff_location = sanitize_text_field($_POST['dropoff_location'] ?? '');
    $pickup_date = sanitize_text_field($_POST['pickup_date'] ?? '');
    $dropoff_date = sanitize_text_field($_POST['dropoff_date'] ?? '');
    $pickup_time = sanitize_text_field($_POST['pickup_time'] ?? '');
    $dropoff_time = sanitize_text_field($_POST['dropoff_time'] ?? '');

    $first_name = sanitize_text_field($_POST['first_name'] ?? '');
    $last_name  = sanitize_text_field($_POST['last_name'] ?? '');
    $email      = sanitize_email($_POST['email'] ?? '');
    $phone      = sanitize_text_field($_POST['phone'] ?? '');

    $airline      = sanitize_text_field($_POST['airline'] ?? '');
    $flight_number= sanitize_text_field($_POST['flight_number'] ?? '');

    $hotel       = sanitize_text_field($_POST['hotel'] ?? '');
    $origin_city = sanitize_text_field($_POST['origin_city'] ?? '');
    $passengers  = intval($_POST['passengers'] ?? 1);
    $connection  = isset($_POST['connection']) ? 'Sí' : 'No';
    $comments    = sanitize_textarea_field($_POST['comments'] ?? '');

    $extras_selected = isset($_POST['extras']) && is_array($_POST['extras'])
        ? array_map('sanitize_text_field', $_POST['extras'])
        : [];

    // Días (mínimo)
    $days = tcr_min_days();
    try {
        if ($pickup_date && $dropoff_date) {
            $start = new DateTime($pickup_date);
            $end   = new DateTime($dropoff_date);
            $diffDays = (int)$start->diff($end)->days;
            $days = max(1, $diffDays);
        }
    } catch (Exception $e) {
        $days = tcr_min_days();
    }
    $days = max($days, tcr_min_days());

    // Temporada + precio diario automático
    $seasonInfo = tcr_detect_season($pickup_date, $dropoff_date);
    $season = $seasonInfo['season']; // high|low
    $seasonLabel = $seasonInfo['label'];

    $daily_price = tcr_get_daily_price_for_dates($cars[$car], $pickup_date, $dropoff_date);
    $car_amount = (float)$daily_price * (int)$days;

    // Cargo por ciudad
    $city_fee_pickup = isset($feeByLabel[$pickup_location]) ? (float)$feeByLabel[$pickup_location] : 0.0;
    $city_fee_dropoff = isset($feeByLabel[$dropoff_location]) ? (float)$feeByLabel[$dropoff_location] : 0.0;
    $city_fee_total = $city_fee_pickup + $city_fee_dropoff;

    // Extras
    $extras_amount = 0.0;
    $extras_rows = [];
    foreach ($extras_selected as $key) {
        if (isset($extrasCatalog[$key])) {
            $extras_amount += (float)$extrasCatalog[$key]['price'];
            $extras_rows[] = [
                'label' => $extrasCatalog[$key]['label'],
                'price' => (float)$extrasCatalog[$key]['price']
            ];
        }
    }

    // After hours automático
    $afterHoursFee = 0.0;
    $afterHoursApplied = false;
    if (tcr_is_after_hours($pickup_time) || tcr_is_after_hours($dropoff_time)) {
        $afterHoursFee = (float) tcr_after_hours_price();
        $afterHoursApplied = true;
    }

    $total = $car_amount + $city_fee_total + $extras_amount + $afterHoursFee;

    $reservation_id = wp_rand(7000, 9999);
    $today = current_time('d/m/Y');

    $brand = tcr_brand_name();
    $subject_client   = $brand . ' | Confirmación de reservación #' . $reservation_id;
    $subject_internal = '['.$brand.'] Nueva reservación #' . $reservation_id;

    $car_image = esc_url($cars[$car]['image'] ?? tcr_default_car_image());

    $conceptRowsHtml = '';
    $conceptRowsHtml .= '<tr><td>Auto ('.$days.' días x $'.number_format($daily_price,2).')<br><span style="opacity:.85">('.esc_html($seasonLabel).')</span></td><td style="text-align:right">$'.number_format($car_amount,2).'</td></tr>';

    if ($city_fee_pickup > 0) {
        $conceptRowsHtml .= '<tr><td>Cargo por ciudad (Entrega: '.esc_html($pickup_location).')</td><td style="text-align:right">$'.number_format($city_fee_pickup,2).'</td></tr>';
    }
    if ($city_fee_dropoff > 0) {
        $conceptRowsHtml .= '<tr><td>Cargo por ciudad (Devolución: '.esc_html($dropoff_location).')</td><td style="text-align:right">$'.number_format($city_fee_dropoff,2).'</td></tr>';
    }

    if ($afterHoursApplied) {
        $conceptRowsHtml .= '<tr><td>Cargo fuera de horario (10:00 pm a 5:00 am)</td><td style="text-align:right">$'.number_format($afterHoursFee,2).'</td></tr>';
    }

    foreach ($extras_rows as $r) {
        $conceptRowsHtml .= '<tr><td>'.esc_html($r['label']).'</td><td style="text-align:right">$'.number_format($r['price'],2).'</td></tr>';
    }
    $conceptRowsHtml .= '<tr><td style="font-weight:900">Total</td><td style="text-align:right;font-weight:900">$'.number_format($total,2).'</td></tr>';

    $incluyeHtml = '';
    foreach ($incluye as $item) {
        $incluyeHtml .= '<div style="margin:3px 0;">• '.esc_html($item).'</div>';
    }

    $emailStyles = '
      body{margin:0;padding:0;background:#1f1f1f;color:#f2f2f2;font-family:Arial,Helvetica,sans-serif}
      .wrap{max-width:860px;margin:0 auto;padding:18px}
      .top{padding:10px 0 14px}
      .h1{font-size:22px;font-weight:900;margin:0 0 8px}
      .p{font-size:13px;line-height:1.5;color:#d7d7d7;margin:0}
      .bar{background:#0f0f0f;color:#fff;text-align:center;font-weight:900;padding:8px 10px;margin-top:14px;font-size:12px;letter-spacing:.06em}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid rgba(255,255,255,.18);padding:8px 10px;vertical-align:top}
      th{background:#0f0f0f;text-align:left}
      .two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
      .img{width:100%;height:220px;object-fit:contain;border:1px solid rgba(255,255,255,.18);background:#111}
      .muted{color:#cfcfcf}
      .note{margin-top:12px;color:#cfcfcf;font-size:11px;line-height:1.45}
      @media(max-width:760px){.two{grid-template-columns:1fr}}
    ';

    $wh = tcr_whatsapp_number();

    $emailHtml = '
    <html><head><meta charset="UTF-8"><style>'.$emailStyles.'</style></head><body>
      <div class="wrap">
        <div class="top">
          <div class="h1">Confirmación de reservación</div>
          <p class="p">
            Estimado(a) '.esc_html($first_name.' '.$last_name).', a continuación encontrará el detalle de la reserva realizada desde nuestro sitio.
            En un periodo máximo de <b>24 horas</b>, nos pondremos en contacto para confirmación y envío de link de pago <b>PayPal</b>.
            Es importante realizar el prepago para garantizar la reserva.
          </p>
          <p class="p muted" style="margin-top:6px;"><b>Origen:</b> '.esc_html($brand).'</p>
          <p class="p muted" style="margin-top:6px;"><b>WhatsApp:</b> '.esc_html($wh).'</p>
          <p class="p muted" style="margin-top:6px;"><b>Temporada aplicada:</b> '.esc_html($seasonLabel).'</p>
        </div>

        <div class="bar">Datos Generales</div>
        <table>
          <tr><th>Reservación</th><td>'.esc_html($reservation_id).'</td><th>Idioma</th><td>'.esc_html($language).'</td></tr>
          <tr><th>Cliente</th><td>'.esc_html($first_name.' '.$last_name).'</td><th>Fecha</th><td>'.esc_html($today).'</td></tr>
          <tr><th>Teléfono</th><td>'.esc_html($phone).'</td><th>Email</th><td>'.esc_html($email).'</td></tr>
          <tr><th>Aerolínea</th><td>'.esc_html($airline ?: '—').'</td><th>No. vuelo</th><td>'.esc_html($flight_number ?: '—').'</td></tr>
          <tr><th>Ciudad origen</th><td>'.esc_html($origin_city).'</td><th>Conexión</th><td>'.esc_html($connection).'</td></tr>
          <tr><th>Hotel</th><td colspan="3">'.esc_html($hotel).'</td></tr>
        </table>

        <div class="bar">Vehículo</div>
        <table>
          <tr><th>Auto</th><td>'.esc_html($car).'</td><th>No. pasajeros</th><td>'.esc_html($passengers).'</td></tr>
          <tr><th>Entrega</th><td>'.esc_html($pickup_location).'</td><th>Fecha / hora</th><td>'.esc_html($pickup_date.' '.$pickup_time).'</td></tr>
          <tr><th>Devolución</th><td>'.esc_html($dropoff_location).'</td><th>Fecha / hora</th><td>'.esc_html($dropoff_date.' '.$dropoff_time).'</td></tr>
        </table>

        <div class="two">
          <div><img class="img" src="'.$car_image.'" alt="Auto"></div>
          <div>
            <div class="bar" style="margin-top:0;">Su Renta incluye</div>
            <div style="border:1px solid rgba(255,255,255,.18); padding:10px 12px;">'.$incluyeHtml.'</div>

            <div class="bar">Comentarios</div>
            <div style="border:1px solid rgba(255,255,255,.18); padding:10px 12px; min-height:54px;">'.esc_html($comments ?: '—').'</div>
          </div>
        </div>

        <div class="bar">Concepto</div>
        <table>
          <tr><th>Concepto</th><th style="text-align:right">Importe</th></tr>
          '.$conceptRowsHtml.'
        </table>

        <div class="note">
          Nota: Todos los pagos realizados con tarjeta de crédito o débito se aplicará un 5% adicional por uso de terminal bancaria.
          <br><br>
          <b>Importante:</b> El link de pago PayPal se enviará posteriormente (máximo 24 horas).
          <br>
          Si no recibe confirmación, revise <b>Spam</b> o contáctenos por WhatsApp: <b>'.esc_html($wh).'</b>
        </div>
      </div>
    </body></html>';

    $headers = [
        'Content-Type: text/html; charset=UTF-8',
        'From: '.tcr_mail_from_name().' <'.tcr_mail_from_email().'>',
        'Reply-To: '.tcr_mail_from_name().' <'.tcr_mail_from_email().'>',
    ];

    if (!empty($email)) {
        wp_mail($email, $subject_client, $emailHtml, $headers);
    }

    foreach (tcr_internal_emails() as $internal) {
        wp_mail($internal, $subject_internal, $emailHtml, $headers);
    }

    wp_safe_redirect(home_url('/gracias-reservacion/'));
    exit;
}
