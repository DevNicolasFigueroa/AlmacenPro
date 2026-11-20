# Spec 001 - Autenticación y roles

## Contexto y objetivo

Un almacén de barrio chileno opera normalmente con un solo mesón y un computador compartido. Durante la jornada pasan por ese equipo el dueño, uno o más cajeros y, a veces, personas ajenas al negocio. Sin control de acceso, cualquiera puede ver reportes, cambiar precios, anular ventas o revisar la deuda de fiado de los clientes.

El problema que resuelve este módulo es doble: **proteger la caja y la información del negocio**, y **saber quién registró cada venta**. El dueño necesita que solo entren personas autorizadas, que cada venta quede asociada a quien la registró y que un trabajador que ya no está no pueda volver a entrar, sin perder el historial de lo que hizo mientras trabajó.

Este es el primer módulo del sistema porque es la puerta de entrada de todos los demás: ventas, inventario, fiado y reportes dependen de saber quién está operando y qué le está permitido hacer. Sin autenticación y roles no hay trazabilidad ni protección de los datos comerciales.

**Objetivo:** que el equipo del almacén ingrese en pocos segundos, trabaje sin fricción tecnológica y no pueda acceder a funciones que no le corresponden. El criterio de éxito del MVP se mantiene: un cajero debe poder ingresar y registrar una venta completa en menos de 30 segundos.

## Usuarios / actores

**Administrador (dueño)**
- Es la cuenta de confianza del negocio. Puede haber más de una, pero siempre debe existir al menos una activa; se recomienda tener dos para contar con respaldo.
- Tiene acceso total: ventas, inventario, clientes y fiado, reportes, anulación de ventas y gestión de cuentas.
- Es el único que puede crear cuentas, activarlas o desactivarlas, restablecer contraseñas y anular ventas.
- Recibe un código de recuperación de un solo uso al momento de crear su cuenta.

**Cajero (trabajador de caja)**
- Su cuenta la crea el Administrador y recibe una contraseña temporal que debe cambiar en su primer ingreso.
- Puede registrar ventas al contado y fiadas, y consultar el inventario y el stock.
- No puede modificar productos, precios ni existencias; no ve costos de compra ni márgenes; no ve reportes, historial de ventas, gestión de cuentas ni el listado completo de deudas; no puede anular ventas.
- No puede gestionar cuentas ni recuperar su contraseña por sí solo: si la olvida, el Administrador le genera una nueva.
- *Nota: la consulta del saldo de fiado del cliente (RF-13) se implementa en fase 2, junto con la spec de fiado/POS.*

## Historias de usuario

- **H1:** Como Administrador quiero ingresar con mis credenciales para operar el almacén sabiendo que nadie más puede hacerlo en mi nombre.
- **H2:** Como Cajero quiero ingresar con mi propia cuenta para registrar ventas sin depender del dueño.
- **H3:** Como Administrador quiero crear una cuenta para cada trabajador para saber quién registró cada venta.
- **H4:** Como Administrador quiero desactivar la cuenta de un trabajador que ya no está para que no vuelva a entrar, sin perder el historial de lo que hizo.
- **H5:** Como Cajero quiero ver solo las funciones que necesito para vender para no equivocarme ni acceder a información que no me corresponde.
- **H6:** Como Administrador quiero que el sistema bloquee los intentos repetidos de ingreso para proteger la caja de accesos no autorizados.
- **H7:** Como Cajero quiero que mi sesión dure mi turno habitual para no tener que escribir la contraseña en cada venta.
- **H8:** Como Administrador quiero recuperar mi acceso con un código de respaldo para no quedar fuera de mi propio negocio.
- **H9:** Como usuario quiero cerrar sesión al terminar mi turno para dejar el sistema protegido.

## Requisitos funcionales (criterios de aceptación en EARS)

**Alcance del MVP:** se implementan RF-1–12, RF-14–29, RF-31 y RF-33–39. RF-13, RF-30 y RF-32, junto con RNF-9, se difieren a fase 2 y se detallan en “Requisitos diferidos a fase 2”.

**Inicio de sesión**

- **RF-1.** CUANDO una persona ingresa un usuario y una contraseña que corresponden a una cuenta activa, EL SISTEMA debe iniciar la sesión y llevarla a la pantalla principal que corresponde a su rol.
- **RF-2.** SI el usuario o la contraseña no corresponden a una cuenta existente, ENTONCES EL SISTEMA debe rechazar el ingreso con el mensaje "Usuario o contraseña incorrectos", sin indicar cuál de los dos datos falló.
- **RF-3.** SI el usuario o la contraseña están vacíos o contienen solo espacios, ENTONCES EL SISTEMA debe impedir el intento, señalar el dato faltante y no contabilizarlo como intento fallido.
- **RF-4.** CUANDO una cuenta acumula cinco intentos fallidos consecutivos, EL SISTEMA debe bloquear el ingreso de esa cuenta durante 15 minutos y mostrar el tiempo restante.
- **RF-5.** MIENTRAS una cuenta esté bloqueada por intentos fallidos, EL SISTEMA debe rechazar todo intento de ingreso, incluso cuando la contraseña ingresada sea la correcta.
- **RF-6.** CUANDO un ingreso es exitoso, EL SISTEMA debe reiniciar a cero el contador de intentos fallidos de esa cuenta.
- **RF-7.** SI la cuenta está desactivada, ENTONCES EL SISTEMA debe impedir el ingreso aun con la contraseña correcta y avisar que debe consultar con el administrador.
- **RF-8.** EL SISTEMA debe impedir el registro público de cuentas: toda cuenta nueva nace de una acción del Administrador.

**Control de acceso y permisos**

- **RF-9.** MIENTRAS la sesión esté vigente, EL SISTEMA debe permitir únicamente las funciones propias del rol de la cuenta.
- **RF-10.** EL SISTEMA debe otorgar al Administrador acceso total a ventas, inventario, clientes y fiado, reportes, anulación de ventas y gestión de cuentas.
- **RF-11.** EL SISTEMA debe permitir al Cajero registrar ventas al contado y fiadas, y consultar el inventario y el stock viendo solo el precio de venta y las existencias.
- **RF-12.** EL SISTEMA debe impedir que el Cajero acceda a reportes, historial de ventas, gestión de cuentas, anulación de ventas, costos de compra, márgenes y al listado completo de deudas de fiado.
- **RF-14.** SI un Cajero intenta acceder a una vista o ejecutar una acción reservada al Administrador, ENTONCES EL SISTEMA debe denegar la acción, mantenerlo en la pantalla donde estaba y mostrar un mensaje claro de permisos insuficientes.
- **RF-15.** EL SISTEMA debe ocultar o deshabilitar en la interfaz las opciones que el rol no puede usar, y denegar igualmente el acceso cuando se intente por cualquier otra vía.
- **RF-16.** SI no existe una sesión vigente, ENTONCES EL SISTEMA debe negar el acceso a cualquier función protegida y solicitar el ingreso.
- **RF-17.** MIENTRAS haya una sesión activa, EL SISTEMA debe mostrar en pantalla quién está operando y con qué rol, para evitar confusiones en un mesón compartido.

**Nota:** RF-13 se difiere a fase 2; su detalle está en “Requisitos diferidos a fase 2”.

**Gestión de cuentas**

- **RF-18.** CUANDO el Administrador crea una cuenta, EL SISTEMA debe exigir el nombre de la persona, un identificador de usuario único y un rol (Administrador o Cajero).
- **RF-19.** SI el identificador de usuario ya existe, ENTONCES EL SISTEMA debe rechazar la creación e indicar que debe elegirse otro.
- **RF-20.** CUANDO el Administrador crea una cuenta de Administrador, EL SISTEMA debe permitirle definir la contraseña, exigir al menos 8 caracteres y que no sea igual al identificador de usuario, y entregarle un código de recuperación de un solo uso mostrado una sola vez.
- **RF-21.** CUANDO el Administrador crea una cuenta de Cajero, EL SISTEMA debe generar una contraseña temporal de un solo uso, mostrarla una sola vez y exigir su cambio en el primer ingreso.
- **RF-22.** MIENTRAS el Cajero no cambie su contraseña temporal, EL SISTEMA debe permitirle únicamente cambiar la contraseña y cerrar sesión.
- **RF-23.** CUANDO el Administrador desactiva una cuenta, EL SISTEMA debe impedir de inmediato nuevos ingresos y conservar intacto el historial de ventas y registros asociados a esa persona.
- **RF-24.** CUANDO el Administrador reactiva una cuenta, EL SISTEMA debe permitir nuevamente el ingreso con las credenciales vigentes.
- **RF-25.** EL SISTEMA debe impedir la eliminación de cuentas y de su historial; la baja de una persona se expresa únicamente como desactivación.
- **RF-26.** SI el Administrador intenta desactivar la única cuenta de Administrador activa, ENTONCES EL SISTEMA debe impedir la acción y explicar que siempre debe quedar al menos un Administrador activo.
- **RF-27.** CUANDO un Administrador restablece la contraseña de otra cuenta, EL SISTEMA debe generar una contraseña temporal nueva, mostrarla una sola vez y cerrar las sesiones abiertas de esa cuenta; si la cuenta objetivo es de Administrador, la acción solo se permite cuando queda otro Administrador activo.
- **RF-28.** CUANDO un usuario cambia su propia contraseña, EL SISTEMA debe exigir la contraseña actual, aceptar la nueva solo si tiene al menos 8 caracteres y no es igual al identificador de usuario, y cerrar las demás sesiones de esa cuenta.
- **RF-29.** CUANDO el Administrador usa su código de recuperación, EL SISTEMA debe permitirle definir una nueva contraseña e invalidar el código para que no pueda reutilizarse.
- **RF-31.** SI un Cajero intenta recuperar su contraseña por sí mismo, ENTONCES EL SISTEMA debe impedirlo; solo el Administrador puede generarle una nueva.

**Nota:** RF-30 y RF-32 se difieren a fase 2; su detalle está en “Requisitos diferidos a fase 2”.

**Sesión y cierre**

- **RF-33.** EL SISTEMA debe mantener la sesión vigente durante 8 horas contadas desde el ingreso, sin renovación automática.
- **RF-34.** CUANDO un usuario cierra sesión, EL SISTEMA debe terminar de inmediato todas las sesiones abiertas de esa cuenta y exigir credenciales para volver a entrar.
- **RF-35.** SI un usuario intenta cerrar sesión mientras tiene una venta en curso, ENTONCES EL SISTEMA debe impedirlo y pedirle terminar o cancelar la venta primero.
- **RF-36.** CUANDO se cumplen las 8 horas de sesión, EL SISTEMA debe exigir un nuevo ingreso antes de continuar operando.
- **RF-37.** MIENTRAS exista una venta en curso, EL SISTEMA debe permitir que la sesión vencida alcance a terminar o cancelar esa venta antes de exigir el nuevo ingreso.
- **RF-38.** CUANDO una cuenta se desactiva mientras tiene una venta en curso, EL SISTEMA debe permitir únicamente terminar o cancelar esa venta y luego retirar el acceso; si la venta queda abandonada, EL SISTEMA debe cancelarla automáticamente tras 15 minutos sin actividad.
- **RF-39.** CUANDO la sesión expira o se cierra, EL SISTEMA debe conservar toda la información ya confirmada y no perder ventas registradas.

## Requisitos no funcionales

- **RNF-1.** Las contraseñas no deben almacenarse ni mostrarse en texto legible en ningún momento; solo debe conservarse una verificación que no permita reconstruirlas.
- **RNF-2.** Las contraseñas temporales y los códigos de recuperación deben mostrarse una sola vez y no deben poder consultarse después.
- **RNF-3.** Las contraseñas no deben aparecer en mensajes, listados, historiales ni registros de actividad.
- **RNF-4.** Los mensajes de error de ingreso no deben revelar si un usuario existe.
- **RNF-5.** El bloqueo por intentos fallidos debe mantenerse vigente aunque la persona cierre el navegador o se reinicie el equipo.
- **RNF-6.** El ingreso debe resolverse en menos de 2 segundos en el equipo habitual del almacén, con la operación normal en curso.
- **RNF-7.** Todos los textos visibles y mensajes de error deben estar en español de Chile, sin jerga técnica, e indicar qué debe hacer la persona.
- **RNF-8.** La sesión debe invalidarse de inmediato al cerrar sesión, desactivar la cuenta o restablecer la contraseña, sin esperar a que venza el plazo de 8 horas.

**Nota:** RNF-9 se difiere a fase 2.

## Requisitos diferidos a fase 2

Estos requisitos no forman parte del MVP. Se conservan con su numeración para implementarlos en una fase posterior sin reinterpretar la spec.

- **RF-13.** CUANDO el Cajero registra una venta fiada, EL SISTEMA debe permitirle consultar el saldo de fiado del cliente que está atendiendo, sin permitirle modificarlo ni registrar abonos. Se implementa junto con la spec de fiado/POS.
- **RF-30.** CUANDO el Administrador solicita un nuevo código de recuperación mientras tiene sesión activa, EL SISTEMA debe generarlo, mostrarlo una sola vez e invalidar el código anterior.
- **RF-32.** EL SISTEMA debe registrar, para cada cuenta, la fecha, la hora y la cuenta que realizó cada creación, cambio de rol, activación, desactivación, cambio o restablecimiento de contraseña y regeneración del código de recuperación, y permitir al Administrador consultar ese registro.
- **RNF-9.** El registro auditable de cambios de cuenta no debe poder modificarse ni eliminarse desde la interfaz.

## Casos límite

- **Usuario desactivado intentando ingresar:** aunque la contraseña sea correcta, el ingreso se rechaza con un aviso de cuenta desactivada y la indicación de consultar con el administrador. No se inicia sesión ni se entrega información adicional.
- **Credenciales vacías:** el intento se detiene antes de validar, se señala el campo faltante y no se suma al contador de intentos fallidos.
- **Cajero intentando acceder a vistas o acciones de administrador:** la acción se deniega, el cajero permanece en su pantalla y ve un mensaje de permisos insuficientes. La denegación aplica también si intenta llegar por una dirección directa, no solo desde el menú.
- **Sesión expirada en medio de la jornada:** el sistema exige un nuevo ingreso. Si hay una venta en curso, permite terminarla o cancelarla antes de bloquear; lo ya confirmado no se pierde.
- **Cuenta bloqueada por cinco intentos fallidos:** se rechaza incluso la contraseña correcta hasta que pasen los 15 minutos, mostrando el tiempo restante.
- **Identificador de usuario repetido:** la creación se rechaza y se pide elegir otro identificador.
- **Desactivación de una cuenta con venta en curso:** la persona solo puede terminar o cancelar esa venta; después pierde el acceso. Si abandona el equipo, la venta se cancela sola tras 15 minutos sin actividad.
- **Intento de desactivar al último Administrador activo:** la acción se rechaza y se explica que debe quedar al menos uno.
- **Administrador que perdió su código de recuperación:** si perdió la contraseña y el código, no existe recuperación automática y se requiere intervención técnica fuera del sistema. La regeneración de código queda para fase 2.
- **Misma cuenta abierta en dos equipos:** al cerrar sesión en uno, se cierran todas. El uso compartido de una cuenta entre personas no está permitido porque rompe la trazabilidad de las ventas.

## Fuera de alcance

- Recuperación de contraseña por correo electrónico (el mecanismo definido es un código de un solo uso entregado en persona).
- Recuperación de acceso cuando se perdieron la contraseña y el código de recuperación; requiere intervención técnica fuera del sistema.
- Autenticación en dos pasos (2FA).
- Inicio de sesión con redes sociales.
- Permisos granulares personalizados: solo existen los dos roles fijos, Administrador y Cajero.
- Registro público o autoservicio de cuentas.
- Notificaciones por correo o mensaje de texto.

**Diferido a fase 2 (no forma parte de este MVP):**

- Consulta del saldo de fiado por el Cajero (RF-13), que se implementa en la spec de fiado/POS.
- Regeneración del código de recuperación (RF-30).
- Auditoría de cambios de cuenta y cambio de rol (RF-32, RNF-9).

## Criterios de finalización

- [ ] Un Administrador puede ingresar con sus credenciales y llega a la pantalla principal con acceso total.
- [ ] Un Administrador puede crear un Cajero, entregarle la contraseña temporal y ese Cajero puede ingresar y cambiarla en su primer acceso.
- [ ] Un Cajero no puede operar sin antes cambiar su contraseña temporal.
- [ ] Credenciales inválidas no permiten el ingreso y el mensaje no revela si el usuario existe.
- [ ] Cinco intentos fallidos bloquean la cuenta 15 minutos; al cumplirse el plazo el ingreso vuelve a estar disponible.
- [ ] Un Cajero puede registrar una venta completa, pero no puede acceder a reportes, historial, gestión de cuentas, anulación ni costos, ni por menú ni por acceso directo.
- [ ] Desactivar un Cajero impide su ingreso de inmediato y su historial de ventas sigue visible para el Administrador.
- [ ] Reactivar un Cajero le permite volver a ingresar con sus credenciales vigentes.
- [ ] El sistema impide desactivar al último Administrador activo.
- [ ] Un Administrador puede desactivar o restablecer la contraseña de otro Administrador, pero el sistema impide dejar el negocio sin ningún Administrador activo.
- [ ] El cierre de sesión termina el acceso en todos los equipos, y no se permite cerrar mientras hay una venta en curso.
- [ ] Al cumplirse 8 horas, el sistema exige un nuevo ingreso; si hay una venta en curso, permite cerrarla antes.
- [ ] Cada venta registrada queda asociada a la cuenta que la realizó.
- [ ] La pantalla muestra en todo momento qué cuenta está operando.
- [ ] Todos los textos visibles están en español y el ingreso responde en menos de 2 segundos en el equipo del almacén.

## Dudas abiertas

No quedan dudas abiertas: todas las decisiones de negocio necesarias están tomadas en esta spec. Se registran las que estuvieron en discusión y el criterio con que se resolvieron, para que la planificación posterior no tenga que reinterpretarlas.

- **Segundo Administrador de respaldo.** El sistema permite varias cuentas de Administrador y protege siempre la última activa, pero no obliga a crear una segunda. Se recomienda que el almacén tenga al menos dos para no depender de una sola persona. Si solo existe una y esa persona pierde la contraseña y el código de recuperación, el acceso se recupera con intervención técnica fuera del sistema.
- **Turnos de más de 8 horas.** La sesión no se extiende ni se renueva: al cumplirse las 8 horas se exige un nuevo ingreso, salvo que haya una venta en curso, que puede terminarse o cancelarse. Se prefiere esta regla a una sesión indefinida porque el equipo es compartido.
- **Fiado visible para el Cajero (fase 2).** La consulta del saldo del cliente que se atiende (RF-13) se implementará junto con la spec de fiado/POS, donde existe la venta fiada. En este MVP el Cajero sigue sin ver el listado completo de deudas (RF-12).
- **Administrador que gestiona a otro Administrador.** Un Administrador puede desactivar o restablecer la contraseña de otro, con la protección de que siempre debe quedar al menos un Administrador activo. La auditoría de esos cambios se implementa en fase 2 (RF-32, RNF-9). Se acepta el riesgo porque los administradores son personas de confianza del dueño y la alternativa es quedar sin acceso al negocio.
- **Alcance del MVP.** Se prioriza lo necesario para operar y proteger la caja: ingreso, sesión de 8 horas, roles, cuentas, contraseñas, recuperación con código, guarda del último Administrador y protección de la venta en curso. La consulta de fiado (RF-13), la regeneración del código (RF-30) y la auditoría/cambio de rol (RF-32, RNF-9) quedan para fase 2.
- **Una cuenta por persona.** No se admiten cuentas genéricas ni compartidas: cada venta debe quedar asociada a la persona que la registró. El sistema no puede impedir que dos personas usen la misma cuenta, pero la regla de uso queda establecida y el Administrador responde por su cumplimiento.
