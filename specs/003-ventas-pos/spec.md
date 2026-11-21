# Spec 003 - Ventas (punto de venta simple)

**Estado:** aprobada

## Contexto y objetivo

El almacén de barrio vive de lo que pasa en el mesón. Hoy cada venta se anota de memoria o en un cuaderno: el dueño no sabe cuánto vendió en el día, el stock se descuadra porque nadie lo descuenta al vender, se pierde la cuenta de quién debe cuánto y, cuando hay un error de cobro, no queda rastro de qué pasó ni de quién lo cometió.

Este módulo resuelve cuatro problemas: **registrar cada venta de forma rápida y sin errores de cálculo**, **descontar el stock solo, en el mismo momento**, **dejar anotada la deuda cuando se vende al fiado** y **saber después qué se vendió, cuándo y quién lo hizo**, con una forma segura de corregir una venta mal hecha y con seguimiento de todo lo que ocurrió en el mesón, incluidas las ventas que no se concretaron. Los datos comerciales son sagrados: el stock nunca queda negativo, el precio de cada producto queda congelado al vender y toda deuda de fiado queda registrada.

Depende de la spec 001 (quién vende y qué le está permitido; la venta en curso que protege la sesión y se cancela sola tras 15 minutos de inactividad) y de la spec 002 (catálogo, precios y stock; los movimientos de stock de tipo venta y anulación). Esta spec incluye el alta de clientes usando solo su RUT, que es su único identificador: todas las compras, fiados y consultas de un cliente se asocian a él. Sin un cliente registrado no se puede vender al fiado ni llevar su cuenta. El nombre es opcional: se puede anotar al registrar al cliente, pero nunca se exige. Corregir o agregar datos después, editar o desactivar clientes y registrar los abonos al fiado pertenecen a la spec de clientes y fiado.

**Objetivo:** que el Cajero registre una venta completa en menos de 30 segundos, vea el stock actualizado al terminar y que el Administrador conozca de un vistazo qué se vendió en cualquier día y qué pasó con cada venta.

## Usuarios / actores

**Cajero**
- Registra ventas al contado (efectivo, débito, crédito) y al fiado; busca productos, arma el carrito, cobra y confirma.
- En cada venta, con cualquier método de pago, pregunta el RUT del cliente (dato opcional) para asociar la compra a su cuenta; si la persona no lo da, vende sin cliente asociado.
- Registra clientes nuevos con solo su RUT, sin salir de la venta, y asocia la venta a clientes ya registrados.
- Al vender ve el saldo pendiente del cliente que está atendiendo, sin poder modificarlo ni registrar abonos (spec 001, RF-13).
- Ve solo nombre, precio de venta, unidad y stock de los productos; nunca costos ni márgenes.
- No ve el historial de ventas, la cuenta completa de los clientes ni el listado de deudas, y no puede anular ventas (spec 001, RF-11 y RF-12).

**Administrador (dueño)**
- Todo lo que hace el Cajero, incluido registrar clientes.
- Consulta el historial de ventas con filtro por fecha y el detalle de cada venta, incluidas las anuladas y las canceladas.
- Consulta la cuenta de cada cliente con sus compras y sus fiados.
- Es el único que puede anular una venta confirmada.

## Historias de usuario

- **HU-1.** Como Cajero, quiero armar una venta agregando productos y cantidades para atender al cliente sin anotar nada en papel.
- **HU-2.** Como Cajero, quiero ver el total actualizado mientras agrego productos para decirle al cliente cuánto debe pagar sin calcular de cabeza.
- **HU-3.** Como Cajero, quiero elegir el método de pago y, en efectivo, ver el vuelto para cobrar rápido y sin equivocarme.
- **HU-4.** Como Cajero, quiero registrar a un cliente nuevo con solo su RUT, sin salir de la venta, para poder asociarle la compra o fiarle en el momento.
- **HU-5.** Como Cajero, quiero vender al fiado a un cliente registrado y ver cuánto debe antes de confirmar para saber a quién le estoy fiando.
- **HU-6.** Como Cajero, quiero que el sistema me avise si no alcanza el stock para no prometer lo que no tengo.
- **HU-7.** Como Administrador, quiero que el stock se descuente solo al confirmar cada venta para no tener que corregirlo a mano.
- **HU-8.** Como Administrador, quiero consultar las ventas por fecha, con las anuladas y las canceladas, para saber cuánto se vendió, quién vendió y qué pasó con cada venta.
- **HU-9.** Como Administrador, quiero ver el detalle de una venta para revisar qué se vendió, a qué precio y cómo se pagó.
- **HU-10.** Como Administrador, quiero consultar la cuenta de un cliente para ver qué ha comprado, qué se le ha fiado y cuánto debe.
- **HU-11.** Como Administrador, quiero anular una venta con error indicando el motivo para recuperar el stock, deshacer la deuda y dejar constancia de lo ocurrido.

## Definiciones

- **Venta en curso (carrito):** venta que se está armando y aún no se confirma. Cada persona tiene como máximo una. No descuenta stock ni registra deuda.
- **Línea:** producto del carrito con su cantidad, su precio congelado y su subtotal. Un producto aparece una sola vez por carrito.
- **Precio congelado:** precio de venta que el producto tenía cuando se agregó al carrito. No cambia aunque el precio del producto se modifique después, ni en la venta ya confirmada.
- **Subtotal:** precio congelado por cantidad, redondeado al peso entero más cercano (medio peso hacia arriba).
- **Total:** suma de los subtotales ya redondeados de todas las líneas.
- **Stock disponible:** existencias actuales del producto. No se reserva mientras el producto está en un carrito: se descuenta solo al confirmar.
- **Venta confirmada (completada):** venta cuyo cobro ya se registró; descontó stock y, si fue fiado, registró la deuda.
- **Venta anulada:** venta confirmada que el Administrador dejó sin efecto; devolvió el stock y deshizo la deuda. Sigue visible en el historial.
- **Venta cancelada:** venta en curso que no se concretó, porque la persona la canceló o porque pasaron 15 minutos sin actividad. No tocó stock ni deuda. Sigue visible en el historial para seguimiento.
- **Venta al contado:** pagada en el momento con efectivo, débito o crédito.
- **Venta al fiado:** venta cuyo total queda como deuda del cliente. Exige un cliente registrado.
- **Cliente:** persona registrada con su RUT chileno (ej. 12.345.678-5), que es su único identificador. El nombre es un dato opcional que puede no existir.
- **Cuenta del cliente:** registro que reúne las compras en que se identificó al cliente por su RUT, con cualquier método de pago, sus fiados y su saldo.
- **Venta sin cliente:** venta al contado en que la persona no entregó su RUT; se completa normalmente pero no queda en la cuenta de nadie.
- **Saldo pendiente:** lo que un cliente debe en total por ventas al fiado, descontados los abonos y las anulaciones.
- **Saldo a favor:** diferencia a favor del cliente cuando lo descontado supera lo que debía, por ejemplo al anular una venta fiada que ya había abonado.
- **Vuelto:** diferencia entre el monto recibido en efectivo y el total. Solo se muestra; no se guarda.

## Requisitos funcionales (criterios de aceptación en EARS)

### Armar la venta

- **RF-1.** CUANDO una persona inicia una venta, EL SISTEMA debe abrir un carrito vacío asociado a su cuenta, permitir como máximo una venta en curso por persona y mantener la protección de la sesión de la spec 001.
- **RF-2.** CUANDO se busca un producto, EL SISTEMA debe permitir buscarlo por nombre o escribiendo su código de barras, y mostrar su precio de venta, unidad y stock disponible.
- **RF-3.** CUANDO se agrega un producto activo al carrito, EL SISTEMA debe incorporarlo con la cantidad indicada (1 por defecto) y fijar como precio de la línea el precio de venta vigente en ese momento.
- **RF-4.** EL SISTEMA debe aceptar cantidades enteras para los productos por unidad y de hasta 3 decimales para los productos por kilo, siempre mayores que 0.
- **RF-5.** SI el producto ya está en el carrito, ENTONCES EL SISTEMA debe sumar la cantidad a la misma línea y mantener el precio con que se agregó por primera vez.
- **RF-6.** MIENTRAS la venta esté en curso, EL SISTEMA debe permitir cambiar la cantidad de una línea, quitarla o vaciar el carrito.
- **RF-7.** SI la cantidad pedida de un producto supera su stock disponible, ENTONCES EL SISTEMA debe avisar de inmediato cuánto stock hay y no agregar esa cantidad.
- **RF-8.** SI el producto está desactivado o agotado, ENTONCES EL SISTEMA debe impedir agregarlo e indicar el motivo.
- **RF-9.** EL SISTEMA debe contar cada cambio del carrito como actividad de la venta, de modo que el aviso y la cancelación automática por inactividad de la spec 001 no se activen mientras se atiende.
- **RF-10.** CUANDO una venta en curso se cancela, manualmente o por inactividad, EL SISTEMA debe descartar el carrito sin modificar el stock ni registrar ninguna deuda, y dejar la venta registrada como cancelada, con los productos que tenía el carrito, para su seguimiento.

### Calcular el total

- **RF-11.** EL SISTEMA debe calcular el subtotal de cada línea como precio congelado por cantidad, redondeado al peso entero más cercano, y el total como la suma de los subtotales ya redondeados.
- **RF-12.** EL SISTEMA debe mostrar en todo momento el subtotal de cada línea y el total, en pesos chilenos sin decimales.
- **RF-13.** SI el subtotal de una línea resulta en $0 tras el redondeo, ENTONCES EL SISTEMA debe pedir una cantidad mayor y no agregar esa línea.

### Cobrar

- **RF-14.** CUANDO se va a cobrar, EL SISTEMA debe pedir elegir un único método de pago: efectivo, débito, crédito o fiado.
- **RF-15.** CUANDO el método es efectivo, EL SISTEMA debe pedir el monto recibido, exigir que sea igual o mayor al total y mostrar el vuelto. El monto recibido y el vuelto solo se muestran en pantalla y no se guardan.
- **RF-16.** CUANDO el método es débito o crédito, EL SISTEMA debe registrar solo el método de pago, sin conectarse a ningún terminal de pago ni pasarela.
- **RF-17.** CUANDO el método es fiado, EL SISTEMA debe exigir identificar al cliente por su RUT, ya sea uno registrado o uno nuevo según RF-20, e impedir confirmar la venta fiada sin cliente; y debe mostrar su saldo pendiente.
- **RF-18.** SI el cliente elegido tiene saldo pendiente, ENTONCES EL SISTEMA debe destacar que está en deuda y mostrar el monto, sin bloquear la venta: el fiado no tiene límite de crédito.
- **RF-19.** EL SISTEMA debe impedir que el Cajero modifique el saldo de un cliente o registre abonos desde la venta.

### Clientes

- **RF-20.** CUANDO el Cajero o el Administrador registra un cliente nuevo, EL SISTEMA debe exigir únicamente un RUT chileno válido (con su dígito verificador, formato 12.345.678-5), permitir anotar su nombre sin exigirlo, no pedir ningún otro dato, y dejar al cliente disponible de inmediato para la venta en curso.
- **RF-21.** SI el RUT ingresado ya pertenece a un cliente registrado, ENTONCES EL SISTEMA debe impedir el registro, indicar quién es y ofrecer elegirlo.
- **RF-22.** CUANDO se va a cobrar, con cualquier método de pago, EL SISTEMA debe preguntar por el RUT del cliente, de forma opcional salvo en el fiado: si el RUT pertenece a un cliente registrado, lo asocia a la venta; si no está registrado, lo registra con solo ese RUT según RF-20 y se lo asocia; y si la persona no quiere dar su RUT, completa la venta sin cliente asociado. EL SISTEMA debe permitir omitir la pregunta con una sola acción, para no retrasar el cobro.
- **RF-23.** CUANDO el Administrador consulta un cliente, EL SISTEMA debe mostrar su cuenta, identificada por su RUT: saldo pendiente o a favor, sus compras (ventas completadas y anuladas asociadas a su RUT) y sus fiados, de la más reciente a la más antigua.
- **RF-24.** EL SISTEMA debe impedir que el Cajero vea la cuenta completa de un cliente, sus compras o el listado de deudas de los clientes; solo ve el saldo del cliente que está atendiendo (spec 001, RF-12 y RF-13).

### Confirmar la venta

- **RF-25.** CUANDO se confirma la venta, EL SISTEMA debe volver a verificar el stock de cada producto y que siga activo, y registrar en una sola operación todo o nada: la venta completada, su detalle con los precios congelados, el descuento de stock de cada producto, el movimiento de stock de tipo venta con referencia a la venta y, si es fiado, el cargo al cliente por el total.
- **RF-26.** SI al confirmar algún producto no tiene stock suficiente, ENTONCES EL SISTEMA debe rechazar toda la venta sin descontar nada ni registrar deuda, indicar qué producto falta y cuánto queda, y conservar el carrito para corregirlo.
- **RF-27.** SI al confirmar algún producto del carrito fue desactivado, ENTONCES EL SISTEMA debe rechazar la confirmación e indicar que hay que quitarlo.
- **RF-28.** SI falla cualquier parte de la confirmación, ENTONCES EL SISTEMA debe dejar el stock, el detalle y las deudas exactamente como estaban, informarlo en español y conservar el carrito.
- **RF-29.** CUANDO dos ventas compiten por el último stock de un producto, EL SISTEMA debe confirmar una y rechazar la otra según RF-26, sin dejar stock negativo.
- **RF-30.** EL SISTEMA debe impedir confirmar una venta sin productos y confirmar dos veces la misma venta.
- **RF-31.** CUANDO se confirma la venta, EL SISTEMA debe registrar fecha y hora, la cuenta que la confirmó, el método de pago, el total y el cliente si lo hay, y mostrar un resumen con el número de venta, el total y, en efectivo, el vuelto.
- **RF-32.** CUANDO se confirma la venta, EL SISTEMA debe mostrar el stock actualizado de los productos vendidos y reflejar de inmediato las marcas de stock bajo o agotado de la spec 002.
- **RF-33.** EL SISTEMA debe impedir modificar o eliminar una venta confirmada; la única corrección posible es anularla.
- **RF-34.** EL SISTEMA debe conservar la venta confirmada asociada a la cuenta que la registró, aunque esa cuenta se desactive después (spec 001, RF-23).

### Historial de ventas

- **RF-35.** EL SISTEMA debe permitir al Administrador consultar todas las ventas que ya no están en curso, es decir, completadas, anuladas y canceladas (por la persona o por inactividad), de la más reciente a la más antigua, con número, fecha y hora, cajero, método de pago, total y estado.
- **RF-36.** EL SISTEMA debe permitir filtrar el historial por fecha, un día o un rango de desde a hasta, y mostrar por defecto las ventas de hoy.
- **RF-37.** CUANDO se filtra el historial, EL SISTEMA debe mostrar la cantidad de ventas completadas y la suma de sus totales en el período, y por separado la cantidad de ventas anuladas y de canceladas; solo las completadas se suman.
- **RF-38.** CUANDO el Administrador abre una venta completada o anulada, EL SISTEMA debe mostrar su detalle: productos, cantidades, precios congelados, subtotales, total, método de pago, cliente si lo hay, cajero y, si fue anulada, quién la anuló, cuándo y por qué.
- **RF-39.** CUANDO el Administrador abre una venta cancelada, EL SISTEMA debe mostrar quién la tenía, cuándo la inició y cuándo se canceló, si fue por la persona o por inactividad, y los productos que tenía el carrito, dejando claro que no afectó el stock ni la deuda.
- **RF-40.** EL SISTEMA debe impedir que el Cajero acceda al historial de ventas, también por acceso directo (spec 001, RF-12).
- **RF-41.** EL SISTEMA debe dejar en el historial de movimientos de cada producto la salida por venta y la devolución por anulación, con referencia a la venta (spec 002, RF-28).

### Anular una venta

- **RF-42.** CUANDO el Administrador anula una venta completada, EL SISTEMA debe exigir un motivo escrito.
- **RF-43.** CUANDO se anula una venta, EL SISTEMA debe registrar en una sola operación todo o nada: la venta como anulada con quién, cuándo y por qué; la devolución al stock de las cantidades vendidas, con un movimiento de tipo anulación de venta con referencia a la venta; y, si fue fiado, el descuento del cargo del saldo del cliente dejando constancia.
- **RF-44.** SI al anular una venta fiada el saldo del cliente queda por debajo de cero porque ya había abonado, ENTONCES EL SISTEMA debe permitir la anulación, mostrar la diferencia como saldo a favor del cliente y dejar constancia, sin devolver dinero ni modificar abonos.
- **RF-45.** SI la venta ya está anulada, ENTONCES EL SISTEMA debe impedir anularla de nuevo.
- **RF-46.** EL SISTEMA debe permitir anular una venta completada sin límite de tiempo.
- **RF-47.** EL SISTEMA debe impedir que el Cajero anule ventas (spec 001, RF-12).
- **RF-48.** EL SISTEMA debe mantener la venta anulada visible en el historial y en la cuenta del cliente, marcada como anulada, y excluirla de los totales.

### Visibilidad por rol

- **RF-49.** EL SISTEMA debe mostrar al Cajero, en la venta, solo nombre, precio de venta, unidad y stock de los productos, sin costos ni márgenes.

## Requisitos no funcionales

- **RNF-1.** Una venta típica, de hasta 5 productos distintos pagada en efectivo y sin pedir el RUT, debe poder registrarse en menos de 30 segundos de principio a fin; pedir el RUT no debe sumar más de unos pocos segundos.
- **RNF-2.** Buscar un producto, buscar un cliente, cambiar una cantidad y confirmar la venta deben responder en menos de 2 segundos, con hasta 5.000 productos y 5.000 clientes.
- **RNF-3.** Ninguna falla ni venta simultánea debe dejar stock negativo, una venta sin detalle, stock descontado sin venta o deuda sin venta. Verificable: stock mayor o igual a 0 y suma de cargos menos abonos igual al saldo de cada cliente.
- **RNF-4.** El historial con filtro por fecha debe responder en menos de 2 segundos con hasta 50.000 ventas.
- **RNF-5.** Los montos deben mostrarse en formato CLP (ej. $1.490), sin decimales, y las cantidades en kilos con coma decimal (ej. 0,35 kg).
- **RNF-6.** Todos los textos y mensajes deben estar en español de Chile, sin jerga técnica, indicando qué debe hacer la persona para corregir el problema.
- **RNF-7.** La pantalla de venta debe poder usarse con teclado y con pantalla táctil, con el total y los botones de cobro legibles a distancia de mesón.
- **RNF-8.** Toda venta, cancelación, anulación y movimiento de stock debe conservar quién, cuándo y su referencia, sin límite de tiempo, y no puede alterarse ni borrarse desde la interfaz.
- **RNF-9.** El costo y el margen no deben viajar ni aparecer en ninguna respuesta o pantalla del Cajero.
- **RNF-10.** El RUT de los clientes debe validarse con su dígito verificador y mostrarse con el formato chileno (ej. 12.345.678-5).

## Casos límite

- **Último producto en dos mesones a la vez:** una venta se confirma y la otra se rechaza con el stock restante; nunca queda stock negativo.
- **Stock insuficiente al agregar:** se avisa de inmediato y no se agrega esa cantidad.
- **Stock que baja mientras se arma el carrito:** por un ajuste del Administrador o una venta de otro mesón; no se detecta hasta confirmar, y entonces se rechaza toda la venta indicando qué corregir.
- **Precio que cambia con el carrito armado:** cada línea conserva el precio con que se agregó; el precio nuevo rige para las ventas siguientes.
- **Producto desactivado con el carrito armado:** no se puede confirmar hasta quitarlo.
- **Producto por kilo con medio peso:** 0,35 kg a $1.590 son $556,5 y se redondean a $557; el total siempre es la suma de las líneas ya redondeadas.
- **Cantidad tan pequeña que el subtotal es $0:** se pide una cantidad mayor.
- **Efectivo recibido menor al total:** no se puede confirmar; se muestra cuánto falta.
- **Cliente con deuda previa:** se vende igual; se destaca que está en deuda y la venta suma al saldo.
- **El cliente no quiere dar su RUT:** la venta se completa sin cliente asociado; solo el fiado lo exige.
- **RUT de un cliente que aún no está registrado:** se registra en el momento con solo el RUT (el nombre se puede anotar, pero no se exige), y la venta queda en su cuenta.
- **Cliente sin nombre:** se identifica y se busca siempre por su RUT; donde se muestre, aparece su RUT.
- **RUT de un cliente ya registrado:** se asocia la venta de inmediato, sin pedir otros datos.
- **RUT mal escrito o con dígito verificador incorrecto:** no se registra el cliente y se pide corregirlo.
- **RUT mal escrito pero válido, ya registrado:** el cliente queda con ese RUT; corregirlo pertenece a la spec de clientes y fiado.
- **Doble clic o doble envío al confirmar:** se registra una sola venta.
- **Cierre del navegador o corte de conexión al confirmar:** la venta queda completa o no queda; al volver se muestra su estado real para no cobrar dos veces.
- **Venta abandonada:** se cancela sola tras 15 minutos sin actividad, sin tocar stock ni deuda, y queda visible en el historial con su carrito (spec 001).
- **Sesión vencida o cuenta desactivada con venta en curso:** la persona solo puede terminarla o cancelarla (spec 001).
- **Anular una venta cuyo producto ya fue desactivado:** el stock se devuelve igual.
- **Anular una venta de un cajero ya desactivado:** se permite; su historial se conserva.
- **Anular una venta fiada cuyo cliente ya abonó:** el saldo puede quedar a favor del cliente; se muestra así y no se devuelve dinero automáticamente.

## Fuera de alcance

- Boleta o factura electrónica y cualquier conexión con el SII (DTE).
- Pasarelas y terminales de pago (Transbank, Mercado Pago, etc.): débito y crédito solo se registran como método.
- Lector de código de barras como hardware o su configuración: solo se puede escribir el código.
- Impresión de comprobantes o boletas.
- Pago combinado con más de un método en una misma venta.
- Descuentos, ofertas, promociones, propinas y listas de precios.
- Devoluciones parciales y edición de una venta confirmada: la única corrección es anularla completa.
- Límite de crédito del fiado.
- Editar, desactivar o eliminar clientes (incluido corregir un RUT) y registrar abonos al fiado: pertenecen a la spec de clientes y fiado.
- Teléfono, dirección y otros datos del cliente además del RUT y el nombre opcional: agregarlos, y corregir o agregar el nombre después del registro, pertenece a la spec de clientes y fiado.
- Devolver dinero al cliente cuando queda saldo a favor.
- Guardar el monto recibido y el vuelto en la venta.
- Cierre de caja, reportes de ventas y de ganancias.
- Ventas sin conexión y varias cajas o sucursales.
- Reservar stock mientras el producto está en un carrito.

## Criterios de finalización

- [ ] El Cajero arma una venta con productos por unidad y por kilo, ve el total actualizado en cada cambio y la confirma en menos de 30 segundos.
- [ ] Un producto agregado conserva su precio aunque el Administrador lo cambie antes de confirmar, y la venta confirmada conserva el precio con que se vendió.
- [ ] Al confirmar, el stock de cada producto baja en la cantidad vendida y la venta, su detalle y los movimientos de stock quedan guardados juntos.
- [ ] Una cantidad mayor al stock se avisa al agregar y, si el stock baja antes de confirmar, la venta se rechaza completa sin descontar nada.
- [ ] Dos ventas simultáneas del último producto confirman una y rechazan la otra, sin dejar stock negativo.
- [ ] En efectivo se pide el monto recibido y se muestra el vuelto; en débito y crédito solo se registra el método.
- [ ] El Cajero registra un cliente con solo su RUT válido, sin salir de la venta y sin pedirle nombre, y un RUT inválido se rechaza con un mensaje claro.
- [ ] Un RUT ya registrado se reconoce y la venta se asocia a su cuenta; no se crea un cliente duplicado.
- [ ] Una venta al fiado exige un cliente registrado, muestra su saldo pendiente destacando si está en deuda y su deuda aumenta en el total de la venta.
- [ ] En cualquier método de pago se pregunta el RUT del cliente; si lo da, la venta queda en su cuenta, y si no quiere darlo, la venta se completa sin cliente asociado.
- [ ] Una venta fiada sin cliente no se puede confirmar.
- [ ] Un producto por kilo con medio peso se redondea al peso más cercano y el total es la suma de las líneas.
- [ ] Si falla cualquier parte de la confirmación, nada queda a medias.
- [ ] El Administrador consulta las ventas por fecha, con las completadas, anuladas y canceladas, ve el total del período solo de las completadas y abre el detalle de cada una.
- [ ] Una venta cancelada, manualmente o por inactividad, aparece en el historial con su carrito y sin haber tocado stock ni deuda.
- [ ] El Administrador consulta la cuenta de un cliente con sus compras, sus fiados y su saldo.
- [ ] El Administrador anula una venta con motivo obligatorio: el stock vuelve, el saldo del cliente baja y la venta queda marcada como anulada en el historial.
- [ ] Anular una venta fiada que ya tenía abonos deja el saldo a favor del cliente, sin errores.
- [ ] Una venta anulada no puede anularse otra vez ni sumarse a los totales.
- [ ] El Cajero no ve costos, márgenes, historial ni la cuenta completa de los clientes, y no puede anular ventas, ni por pantalla ni por acceso directo.
- [ ] Todos los montos están en CLP sin decimales y todos los textos en español.

## Dudas abiertas

No quedan dudas abiertas. Se registran las que estuvieron en discusión y cómo se resolvieron:

- **Primeros clientes.** Se registran desde la propia venta, con solo su RUT (RF-20).
- **Quién registra clientes.** El Cajero y el Administrador, que puede hacer lo mismo que el Cajero.
- **Cliente en todas las ventas.** Con cualquier método de pago se pregunta el RUT, de forma opcional (RF-22).
- **Anular una venta fiada con abonos.** Se permite y queda saldo a favor (RF-44).
- **Plazo para anular.** Sin plazo (RF-46).
- **Ventas canceladas en el historial.** Se muestran, para tener seguimiento (RF-35 a RF-39).

### Decisiones tomadas en la redacción

- **Stock insuficiente.** Se avisa al agregar (RF-7) y se rechaza toda la venta al confirmar (RF-26), sin vender lo disponible por cuenta propia.
- **Fiado.** El cliente debe estar registrado; no hay límite de crédito: se muestra el saldo pendiente y se destaca que el cliente está en deuda para que se note en compras posteriores, sin bloquear la venta (RF-17 y RF-18).
- **Clientes.** El RUT es el único identificador: un cliente se registra con solo su RUT desde la propia venta, por el Cajero o el Administrador (RF-20 y RF-21), y todas sus compras, fiados y consultas se asocian a él (RF-23). El nombre es opcional: puede anotarse al registrar, nunca se exige.
- **RUT en todas las ventas.** Con cualquier método de pago se pregunta el RUT, de forma opcional: si el cliente lo da, la compra queda en su cuenta; si no lo da, la venta se hace sin cliente asociado. Solo el fiado exige cliente (RF-17 y RF-22).
- **Corrección de ventas.** Solo se anula la venta completa, con motivo obligatorio, sin límite de tiempo y solo por el Administrador (RF-42 a RF-47). No hay edición ni devolución parcial.
- **Anular una venta fiada con abonos.** Se permite y el exceso queda como saldo a favor del cliente (RF-44). Se prefiere a bloquear la anulación porque obligaría a deshacer un pago que sí ocurrió, y los datos siguen cuadrando: cargos menos abonos igual al saldo.
- **Seguimiento.** El historial incluye también las ventas canceladas, con su carrito y la causa (RF-35, RF-37 y RF-39), para tener claridad de todo lo que se hizo en el mesón.
- **Redondeo.** Cada línea se redondea al peso más cercano y el total es la suma de las líneas (RF-11).
- **Efectivo.** Se pide el monto recibido y se muestra el vuelto, pero no se guarda (RF-15).
- **Precio durante la venta.** Queda congelado al agregar el producto, según la spec 002.
