Seazencity PWA (WLED control, default UI)

Wi-Fi Setup открывается прямо по адресу:
http://4.3.2.1/settings/wifi
(путь /settings/wifi есть в sitemap WLED Web GUI) https://kno.wled.ge/features/subpages/ citeturn0search5

Сценарий:
1) Установи PWA (Add to Home screen).
2) В PWA: подключись к сети seazencity -> "Я подключился".
3) "Продолжить" -> откроется WiFi Setup. Введи SSID/пароль, "Save & Connect".
4) Вернись в PWA, переключись на домашний Wi-Fi -> "Я вернулся".
5) PWA попробует seazencity.local.
6) Если mDNS не сработал: PWA попросит снова подключиться к seazencity, сама возьмёт STA IP из /json/info (поле info.ip),
   затем попросит снова вернуться на домашний Wi-Fi и откроет управление.

Управление:
- GET /json/state
- POST /json/state {"on": true/false}
