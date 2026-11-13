import type { Metadata } from 'next'
import { Aviso } from '@/components/campos'
import { B, Etapa, Paso } from '../pasos'

export const metadata: Metadata = { title: 'Guía: gestión de leads' }

export default function GuiaLeads() {
  return (
    <>
      <Aviso>
        Un lead es una persona que dejó sus datos y aún no es cliente. Hay dos tipos: <strong>propietario</strong>{' '}
        (quiere vender) e <strong>interesado</strong> (quiere comprar). Los primeros pasos son iguales para ambos;
        después cada uno sigue su camino.
      </Aviso>

      <Etapa titulo="1. Cada día: por dónde empezar">
        <Paso n={1} titulo="Revisa la página Hoy" donde={{ texto: 'Hoy', href: '/' }}>
          <p>
            En <B>Atiende primero</B> están los leads con una acción pendiente, con la más atrasada arriba. Toca{' '}
            <B>Abrir</B> para ir a la ficha. También verás las citas y visitas del día y las confirmaciones y
            recordatorios por enviar.
          </p>
        </Paso>
        <Paso n={2} titulo="Revisa los chats sin leer" donde={{ texto: 'Chats', href: '/chats' }}>
          <p>
            El número junto a Chats en el menú indica cuántos mensajes de clientes faltan leer. Responde desde ahí o
            desde la ficha del lead.
          </p>
        </Paso>
        <Paso n={3} titulo="Usa la bandeja para buscar a alguien" donde={{ texto: 'Leads', href: '/leads' }}>
          <p>
            Busca por nombre o teléfono y filtra por estado, tipo, canal y fecha. La bandeja muestra los leads activos,
            ordenados por próxima acción. El asesor ve solo sus leads; el administrador ve todos.
          </p>
        </Paso>
      </Etapa>

      <Etapa
        titulo="2. Registrar un lead y darle la bienvenida"
        cuando="Apenas entra un lead nuevo, idealmente en minutos."
      >
        <Paso n={1} titulo="Registra el lead" donde={{ texto: 'Leads → Registrar lead', href: '/leads/nuevo' }}>
          <ul>
            <li>Llena teléfono (WhatsApp), nombre, tipo y canal de origen.</li>
            <li>
              Si mencionó un inmueble o llegó por una publicación, elige el inmueble o escribe el código de la
              publicación.
            </li>
            <li>Marca el consentimiento (Ley 29733): uso de datos y, si aceptó, novedades y marketing.</li>
            <li>
              El administrador puede asignarlo a un asesor en <B>Asignar a</B>.
            </li>
          </ul>
          <p>
            Si el teléfono ya existe, el lead se une al registro de esa persona y verás su historial. Si regresa dentro
            del plazo configurado, la ficha muestra la tarjeta <B>Lead que regresa</B> con dónde quedó, y el botón{' '}
            <B>Enviar mensaje para retomar</B>.
          </p>
        </Paso>
        <Paso n={2} titulo="Envía la bienvenida" donde={{ texto: 'Ficha del lead → Seguimiento' }}>
          <p>
            En la tarjeta Seguimiento, toca <B>Enviar bienvenida</B> (Día 0). Al enviarla se programan los refuerzos.
          </p>
        </Paso>
        <Paso n={3} titulo="Si no responde, envía los refuerzos" donde={{ texto: 'Ficha del lead → Seguimiento' }}>
          <p>
            El panel te recuerda cada refuerzo en su día (por defecto, Días 1, 3 y 4): toca <B>Enviar refuerzo</B>. Tras
            el último sin respuesta, el lead pasa solo a <B>No responde</B> y sale del seguimiento diario.
          </p>
        </Paso>
        <Paso n={4} titulo="Cuando responde, conversa por el chat" donde={{ texto: 'Ficha del lead → Chat' }}>
          <ul>
            <li>Al responder, los refuerzos pendientes se cancelan solos.</li>
            <li>
              Si respondió por llamada u otro medio, toca <B>Respondió por otro medio</B> en Seguimiento.
            </li>
            <li>Pasadas 24 horas desde su último mensaje, el chat solo permite enviar plantillas.</li>
          </ul>
        </Paso>
        <Paso n={5} titulo="Completa el contacto y deja notas" donde={{ texto: 'Ficha del lead → Seguimiento' }}>
          <ul>
            <li>
              En <B>Contacto</B> → <B>Editar</B>: horario preferido y medio por el que prefiere que lo contacten.
            </li>
            <li>
              En <B>Notas</B>, escribe lo que pasó o acordaron y toca <B>Agregar nota</B>.
            </li>
            <li>
              Si quedaste en hacer algo en una fecha, usa <B>Programar acción</B>: aparecerá en Hoy ese día.
            </li>
          </ul>
        </Paso>
      </Etapa>

      <Etapa titulo="3A. Si es propietario: de la calificación al contrato">
        <Paso n={1} titulo="Llena la calificación" donde={{ texto: 'Ficha del lead → Calificación' }}>
          <p>
            Registra rol (propietario o encargado), hipoteca, datos del inmueble, precio esperado, urgencia y situación
            legal, y toca <B>Guardar calificación</B>. Los campos pendientes llevan la marca <B>Falta</B>; cuando no
            falte nada verás <B>Datos completos</B>.
          </p>
        </Paso>
        <Paso n={2} titulo="Agenda la cita" donde={{ texto: 'Ficha del lead → Citas e inmueble' }}>
          <p>
            Toca <B>+ Agendar cita</B> y llena fecha y hora, dirección y las consideraciones de acceso (llave, código,
            DNI). El lead pasa a Cita agendada y la cita aparece en la Agenda.
          </p>
        </Paso>
        <Paso n={3} titulo="Envía la confirmación y los recordatorios" donde={{ texto: 'Agenda', href: '/agenda' }}>
          <p>
            En la cita toca <B>Enviar confirmación</B>; luego <B>Recordatorio 24 h</B> y <B>Recordatorio de hoy</B>{' '}
            cuando toquen. Si cambia de planes, usa <B>Reprogramar</B> o <B>Cancelar</B>.
          </p>
        </Paso>
        <Paso n={4} titulo="Registra el resultado de la cita" donde={{ texto: 'Ficha del lead → Citas e inmueble' }}>
          <p>
            Después de la cita, toca <B>Registrar resultado</B>: cómo fue, estado del inmueble, precio acordado y
            características. Con <B>Guardar y crear ficha del inmueble</B> se crea el inmueble en estado En captación.
          </p>
        </Paso>
        <Paso n={5} titulo="Registra el contrato firmado" donde={{ texto: 'Ficha del inmueble → Contrato' }}>
          <p>
            Cuando firme, abre la ficha del inmueble y toca <B>Registrar contrato</B>. El propietario pasa a Cliente y
            el inmueble a En cartera. Los pasos siguen en la guía de gestión de inmuebles.
          </p>
        </Paso>
      </Etapa>

      <Etapa titulo="3B. Si es interesado: del perfil a la compraventa">
        <Paso n={1} titulo="Registra su perfil de búsqueda" donde={{ texto: 'Ficha del lead → Perfil y capacidad' }}>
          <p>
            Finalidad, distritos, tipo de inmueble, rango de precio, dormitorios, metraje e imprescindibles. Toca{' '}
            <B>Guardar perfil</B>.
          </p>
        </Paso>
        <Paso n={2} titulo="Registra su capacidad financiera" donde={{ texto: 'Ficha del lead → Perfil y capacidad' }}>
          <ul>
            <li>
              Llena presupuesto máximo, forma de pago y cuota inicial, y toca <B>Guardar capacidad</B>. Con presupuesto
              y forma de pago el nivel sube solo a Declarada.
            </li>
            <li>
              Si paga con crédito y no tiene precalificación, toca <B>+ Derivar</B> para registrar el banco o bróker, y
              después <B>Actualizar estado</B> con el resultado: Precalificado o Aprobado suben su nivel.
            </li>
          </ul>
        </Paso>
        <Paso n={3} titulo="Envíale los inmuebles que hacen match" donde={{ texto: 'Ficha del lead → Matches' }}>
          <p>
            La lista viene ordenada por puntaje y no incluye los que están fuera de su capacidad ni los que ya rechazó.
            Marca hasta tres y toca <B>Enviar 3 opciones</B> (el botón dice cuántas elegiste). El lead pasa a Match
            enviado.
          </p>
        </Paso>
        <Paso n={4} titulo="Registra su respuesta a cada opción" donde={{ texto: 'Ficha del lead → Matches' }}>
          <p>
            En <B>Envíos y respuestas</B>, marca <B>Me interesa</B>, <B>No me interesa</B> o <B>Ver parecidos</B> en
            cada inmueble. Si le interesan varios, <B>Prioridad entre los que le interesan</B> señala el recomendado.
          </p>
        </Paso>
        <Paso n={5} titulo="Agenda la visita" donde={{ texto: 'Ficha del lead → Visitas' }}>
          <p>
            Elige el inmueble, la fecha y la hora, y toca <B>Agendar visita</B>. La visita toma la dirección y el acceso
            de la ficha del inmueble. Si su nivel financiero no alcanza el exigido para visitar, el panel no deja
            agendar: actualízalo primero en Perfil y capacidad. Envía la confirmación y los recordatorios igual que en
            una cita.
          </p>
        </Paso>
        <Paso n={6} titulo="Marca la visita y registra su opinión" donde={{ texto: 'Ficha del lead → Visitas' }}>
          <p>
            Tras la visita toca <B>Marcar realizada</B>, luego <B>Pedir opinión</B> y, cuando responda,{' '}
            <B>Registrar opinión</B> (interés, calificación, qué le gustó y qué no). La opinión alimenta los insights
            del propietario.
          </p>
        </Paso>
        <Paso n={7} titulo="Inicia la compraventa" donde={{ texto: 'Ficha del lead → Compraventa' }}>
          <p>
            Cuando decida comprar, toca <B>Iniciar compraventa</B> y elige el inmueble. Se exige el nivel financiero
            configurado (por defecto, Precalificada). No existe la separación del inmueble.
          </p>
        </Paso>
        <Paso n={8} titulo="Registra el cierre" donde={{ texto: 'Ficha del lead → Compraventa' }}>
          <p>
            Firmada la compraventa, toca <B>Registrar cierre</B>: fecha, precio de venta y comisión pagada. El comprador
            pasa a Cliente y el inmueble a Vendido. Si no se concreta, toca <B>Se cayó</B> e indica el motivo: el
            interesado vuelve a Visita realizada.
          </p>
        </Paso>
      </Etapa>

      <Etapa titulo="4. Postventa" cuando="Para compradores y propietarios que ya son Cliente.">
        <Paso
          n={1}
          titulo="Pide el testimonio y la reseña"
          donde={{ texto: 'Ficha del lead → Compraventa o Postventa' }}
        >
          <p>
            Pasado el plazo configurado (por defecto, 7 días tras el cierre), toca <B>Pedir testimonio y reseña</B>.
            Cuando conteste, usa <B>Registrar respuesta</B>: si dio testimonio, si dejó reseña y si autoriza usarlo en
            redes.
          </p>
        </Paso>
        <Paso n={2} titulo="Registra su intención" donde={{ texto: 'Ficha del lead → Intención y marketing' }}>
          <p>
            Con <B>Editar</B>, elige Invertir, Comprar otro inmueble o Vender. Según eso queda en la lista de marketing.
          </p>
        </Paso>
        <Paso n={3} titulo="Envía novedades" donde={{ texto: 'Marketing', href: '/marketing' }}>
          <p>
            Filtra por intención y toca <B>Enviar novedades</B>. Abajo están los leads en No responde a los que ya les
            toca recibir novedades. Solo reciben quienes aceptaron marketing y no están en Baja.
          </p>
        </Paso>
      </Etapa>

      <Etapa titulo="En cualquier momento">
        <Paso n={1} titulo="Cambiar el estado" donde={{ texto: 'Ficha del lead → Cambiar estado' }}>
          <p>
            Elige el nuevo estado y deja una nota (obligatoria para descartar). Algunos estados no se eligen a mano:
            Cita agendada, Visita agendada, Compraventa en curso y Cliente se alcanzan al agendar, iniciar la
            compraventa, registrar el contrato o el cierre.
          </p>
        </Paso>
        <Paso n={2} titulo="Marcar Baja" donde={{ texto: 'Ficha del lead → Baja' }}>
          <p>
            Si pide no ser contactado, toca <B>Baja</B>, escribe cómo lo pidió y confirma. Desde ese momento no recibe
            ningún mensaje. Usa <B>Reactivar</B> solo si la misma persona pide volver a ser contactada.
          </p>
        </Paso>
        <Paso n={3} titulo="Asignar a un asesor (administrador)" donde={{ texto: 'Ficha del lead → Asignar' }}>
          <p>La asignación es manual. Cada asesor ve solo los leads que tiene asignados.</p>
        </Paso>
        <Paso n={4} titulo="Ver todo lo que pasó" donde={{ texto: 'Ficha del lead → Historial' }}>
          <p>Cambios de estado, notas y eventos, cada uno con su fecha y su autor.</p>
        </Paso>
      </Etapa>
    </>
  )
}
